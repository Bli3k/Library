// student.js — Student Portal
(function () {
  const user = LibraryAuth.requireAuth(['student'])
  if (!user) return

  const booksWrap      = document.getElementById('books-wrap')
  const searchInput    = document.getElementById('book-search')
  const categoryFilter = document.getElementById('category-filter')
  const requestsWrap   = document.getElementById('requests-wrap')
  const welcomeText    = document.getElementById('welcome-text')
  const logoutBtn      = document.getElementById('logout-btn')
  const paginationWrap = document.getElementById('books-pagination')

  const itemsPerPage = 20
  let currentPage    = 1

  welcomeText.textContent =
    'Welcome, ' + user.name +
    ' (' + user.courseStrand +
    ' — ' + user.year +
    ', Section ' + user.section + ')'

  logoutBtn.addEventListener('click', function () {
    LibraryAuth.logout()
    window.location.href = 'login.html'
  })

  // ── Helpers ────────────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  function statusBadge(status) {
    return '<span class="badge badge-' + status + '">' + escapeHtml(status) + '</span>'
  }

  // ── Category / sheet filter ─────────────────────────────────────────────────
  function updateCategoryOptions() {
    if (!categoryFilter) return
    const books = LibraryAuth.loadBooks() || []
    const cats  = new Set()
    books.forEach(function (b) {
      const c = String(b.sheet || b.category || '').trim()
      if (c) cats.add(c)
    })
    const current = categoryFilter.value || ''
    categoryFilter.innerHTML = ''
    const allOpt = document.createElement('option')
    allOpt.value       = ''
    allOpt.textContent = 'All Sheets'
    categoryFilter.appendChild(allOpt)
    Array.from(cats).sort().forEach(function (c) {
      const opt = document.createElement('option')
      opt.value       = c
      opt.textContent = c
      categoryFilter.appendChild(opt)
    })
    if (current && Array.from(cats).includes(current)) categoryFilter.value = current
  }

  // ── Render books ────────────────────────────────────────────────────────────
  function renderBooks() {
    const books    = LibraryAuth.loadBooks()
    const requests = LibraryAuth.loadRequests()

    updateCategoryOptions()

    const q           = searchInput ? searchInput.value.trim().toLowerCase() : ''
    const selectedCat = categoryFilter && categoryFilter.value ? categoryFilter.value : ''

    const filtered = books.filter(function (book) {
      if (selectedCat) {
        if (String(book.sheet || book.category || '').trim() !== selectedCat) return false
      }
      if (!q) return true
      return (
        String(book.title    || '').toLowerCase().includes(q) ||
        String(book.author   || '').toLowerCase().includes(q) ||
        String(book.isbn     || '').toLowerCase().includes(q) ||
        String(book.sheet    || book.category || '').toLowerCase().includes(q)
      )
    })

    const totalItems = filtered.length
    if (totalItems === 0) {
      booksWrap.innerHTML = '<p class="muted" style="padding:16px 0;">No books match your search.</p>'
      if (paginationWrap) paginationWrap.innerHTML = ''
      return
    }

    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage))
    if (currentPage > totalPages) currentPage = totalPages

    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex   = Math.min(startIndex + itemsPerPage, totalItems)
    const pageItems  = filtered.slice(startIndex, endIndex)

    // Group by sheet/category
    const groups = {}
    pageItems.forEach(function (book, idx) {
      const globalIndex = startIndex + idx + 1
      const cat = String(book.sheet || book.category || '').trim()
      if (!groups[cat]) groups[cat] = []
      groups[cat].push({ book: book, index: globalIndex })
    })

    let html = ''
    Object.keys(groups).sort().forEach(function (cat) {
      if (!cat) return
      html += '<section class="category-section">'
      html += '<h3>' + escapeHtml(cat) + ' (' + groups[cat].length + ')</h3>'
      html += '<div class="book-grid">'

      groups[cat].forEach(function (item) {
        const book        = item.book
        const globalIndex = item.index
        const available   = LibraryAuth.getAvailableCopies(book)

        const pending = requests.find(function (r) {
          return r.userId === user.id && String(r.bookId) === String(book.id) && r.status === 'pending'
        })
        const approved = requests.find(function (r) {
          return r.userId === user.id && String(r.bookId) === String(book.id) && r.status === 'approved'
        })

        let action = ''
        if (approved) {
          action = '<span class="badge badge-approved">Borrowed</span>'
        } else if (pending) {
          action = '<span class="muted" style="font-size:12px;">Request pending…</span>'
        } else if (available > 0) {
          action = '<button class="btn-link small" data-id="' + escapeHtml(book.id) + '" data-action="borrow">Request Borrow</button>'
        } else {
          action = '<span class="muted" style="font-size:12px;">Unavailable</span>'
        }

        const dispTitle = (book.title && String(book.title).trim())
          ? book.title
          : (book.isbn ? 'ISBN: ' + book.isbn : 'Untitled')

        html += '<div class="book-card" data-id="' + escapeHtml(book.id) + '">'
        html += '<div style="display:flex;gap:10px;align-items:flex-start;">'
        html += '<div class="book-number">' + globalIndex + '</div>'
        html += '<div style="flex:1;min-width:0;">'
        html += '<h4>' + escapeHtml(dispTitle) + '</h4>'
        if (book.author) html += '<div class="book-meta">' + escapeHtml(book.author) + '</div>'
        if (book.year)   html += '<div class="book-meta">Published: ' + escapeHtml(book.year) + '</div>'
        if (book.isbn)   html += '<div class="book-meta">ISBN: ' + escapeHtml(book.isbn) + '</div>'
        html += '</div></div>'
        html += '<div class="book-actions">'
        html += '<div class="book-availability">Available: <strong>' + available + '</strong> / ' + (Number(book.copies) || 0) + '</div>'
        html += action
        html += '</div></div>'
      })

      html += '</div></section>'
    })

    booksWrap.innerHTML = html
    renderPagination(totalPages, totalItems, startIndex, endIndex)

    booksWrap.querySelectorAll('button[data-action="borrow"]').forEach(function (btn) {
      btn.addEventListener('click', onBorrow)
    })
  }

  // ── Pagination ─────────────────────────────────────────────────────────────
  function renderPagination(totalPages, totalItems, startIndex, endIndex) {
    if (!paginationWrap) return
    paginationWrap.innerHTML = ''

    const info = document.createElement('div')
    info.className   = 'page-info'
    info.textContent = 'Showing ' + (totalItems ? startIndex + 1 : 0) + '–' + endIndex + ' of ' + totalItems

    if (totalPages <= 1) {
      const container  = document.createElement('div'); container.className = 'pagination'
      const pageInfo   = document.createElement('div'); pageInfo.className = 'page-info'; pageInfo.textContent = 'Page 1 of 1'
      container.appendChild(pageInfo); container.appendChild(info); paginationWrap.appendChild(container); return
    }

    const container = document.createElement('div'); container.className = 'pagination'

    const prev = document.createElement('button')
    prev.textContent = '← Prev'; prev.disabled = currentPage === 1
    prev.addEventListener('click', function () { gotoPage(currentPage - 1) })
    container.appendChild(prev)

    var maxButtons = 7, start = 1, end = totalPages
    if (totalPages > maxButtons) {
      start = Math.max(1, currentPage - 2); end = Math.min(totalPages, currentPage + 2)
      if (start <= 2) { start = 1; end = Math.min(totalPages, maxButtons) }
      else if (end >= totalPages - 1) { end = totalPages; start = Math.max(1, totalPages - (maxButtons - 1)) }
    }

    function addPageButton(i) {
      var b = document.createElement('button'); b.textContent = String(i)
      if (i === currentPage) { b.className = 'active'; b.disabled = true }
      b.addEventListener('click', function () { gotoPage(i) })
      container.appendChild(b)
    }
    function addEllipsis() {
      var s = document.createElement('span'); s.textContent = '…'
      s.style.cssText = 'padding:6px 8px;color:var(--muted)'; container.appendChild(s)
    }

    if (start > 1) { addPageButton(1); if (start > 2) addEllipsis() }
    for (var i = start; i <= end; i++) addPageButton(i)
    if (end < totalPages) { if (end < totalPages - 1) addEllipsis(); addPageButton(totalPages) }

    const next = document.createElement('button')
    next.textContent = 'Next →'; next.disabled = currentPage === totalPages
    next.addEventListener('click', function () { gotoPage(currentPage + 1) })
    container.appendChild(next)

    const pageInfo = document.createElement('div'); pageInfo.className = 'page-info'
    pageInfo.textContent = 'Page ' + currentPage + ' of ' + totalPages

    paginationWrap.appendChild(container)
    paginationWrap.appendChild(pageInfo)
    paginationWrap.appendChild(info)
  }

  function gotoPage(page) {
    if (!page || page < 1) page = 1
    currentPage = page; renderBooks()
    try { window.scrollTo({ top: 0, behavior: 'smooth' }) } catch (e) {}
  }

  // ── Render borrow requests ─────────────────────────────────────────────────
  function renderRequests() {
    var requests = LibraryAuth.loadRequests().filter(function (r) {
      return r.userId === user.id
    })

    if (requests.length === 0) {
      requestsWrap.innerHTML = '<p class="muted" style="padding:16px 0;">You have not submitted any borrow requests yet.</p>'
      return
    }

    requests.sort(function (a, b) { return new Date(b.requestedAt) - new Date(a.requestedAt) })

    // Count books not yet returned — show a banner if any are overdue
    var notReturned = requests.filter(function (r) {
      return r.status === 'approved' && !r.returnedAt
    })
    var overdue = notReturned.filter(function (r) {
      return r.reviewedAt && Math.floor((Date.now() - new Date(r.reviewedAt).getTime()) / 86400000) >= 7
    })

    var bannerHtml = ''
    if (overdue.length > 0) {
      bannerHtml = '<div style="background:#fff8ed;border:1.5px solid #fcd34d;border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;gap:10px;align-items:flex-start;">'
        + '<span style="font-size:20px;line-height:1;">&#9888;&#65039;</span>'
        + '<div><div style="font-weight:700;color:#d97706;font-size:13.5px;margin-bottom:3px;">Please Return Your Book' + (overdue.length > 1 ? 's' : '') + '</div>'
        + '<div style="font-size:13px;color:#92400e;">You have <strong>' + overdue.length + '</strong> book' + (overdue.length > 1 ? 's' : '') + ' that '
        + (overdue.length > 1 ? 'have' : 'has') + ' been borrowed for 7 or more days. Please return ' + (overdue.length > 1 ? 'them' : 'it') + ' to the library at your earliest convenience.</div>'
        + '</div></div>'
    } else if (notReturned.length > 0 && overdue.length === 0) {
      bannerHtml = '<div style="background:var(--blue-lt);border:1.5px solid #bfdbfe;border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;gap:10px;align-items:center;">'
        + '<span style="font-size:18px;">&#128218;</span>'
        + '<div style="font-size:13px;color:#1e40af;">You currently have <strong>' + notReturned.length + '</strong> borrowed book' + (notReturned.length > 1 ? 's' : '') + '. Please return ' + (notReturned.length > 1 ? 'them' : 'it') + ' when you are done.</div>'
        + '</div>'
    }

    var html = bannerHtml
      + '<table><thead><tr>'
      + '<th>Book</th><th>Author</th><th>Status</th>'
      + '<th>Return Status</th><th>Requested</th><th>Reviewed</th><th>Admin Notes</th>'
      + '</tr></thead><tbody>'

    requests.forEach(function (req) {
      // Return status column
      var returnCol = '—'
      if (req.status === 'approved') {
        if (req.returnedAt) {
          returnCol = '<span class="badge badge-approved">&#10003; Returned</span>'
            + '<div style="font-size:11px;color:var(--muted);margin-top:2px;">' + new Date(req.returnedAt).toLocaleDateString() + '</div>'
        } else {
          var daysOut = req.reviewedAt ? Math.floor((Date.now() - new Date(req.reviewedAt).getTime()) / 86400000) : 0
          var urgency = daysOut >= 7
            ? '<span class="badge badge-pending" style="font-size:11px;background:#fff8ed;border-color:#fcd34d;color:#d97706;">&#9888; Please Return (' + daysOut + 'd)</span>'
            : '<span class="badge badge-pending" style="font-size:11px;">Not Yet Returned</span>'
          // Show notification dot if admin sent a reminder
          var notifLine = req.returnNotifiedAt
            ? '<div style="font-size:10.5px;color:var(--amber);margin-top:2px;">&#128276; Reminder sent by admin</div>'
            : ''
          returnCol = urgency + notifLine
        }
      }

      // Row highlight if overdue
      var rowStyle = (req.status === 'approved' && !req.returnedAt && req.reviewedAt
        && Math.floor((Date.now() - new Date(req.reviewedAt).getTime()) / 86400000) >= 7)
        ? ' style="background:#fff8ed;"' : ''

      html += '<tr' + rowStyle + '>'
        + '<td><strong>' + escapeHtml(req.bookTitle) + '</strong></td>'
        + '<td>' + escapeHtml(req.bookAuthor || '') + '</td>'
        + '<td>' + statusBadge(req.status) + '</td>'
        + '<td>' + returnCol + '</td>'
        + '<td>' + escapeHtml(new Date(req.requestedAt).toLocaleString()) + '</td>'
        + '<td>' + escapeHtml(req.reviewedAt ? new Date(req.reviewedAt).toLocaleString() : '—') + '</td>'
        + '<td>' + escapeHtml(req.adminNotes || '—') + '</td>'
        + '</tr>'
    })
    html += '</tbody></table>'
    requestsWrap.innerHTML = html
  }

  // ── Borrow action ──────────────────────────────────────────────────────────
  function onBorrow(e) {
    const bookId = e.currentTarget.dataset.id
    if (!confirm('Send a borrow request to the admin for this book?')) return

    const result = LibraryAuth.createBorrowRequest(user.id, bookId)

    if (!result.ok) {
      alert(result.error);
      return;
    }

    // Push immediately to Firebase
    if (window.LibraryFirebase) {
      LibraryFirebase.syncRequests(
        LibraryAuth.loadRequests()
      )
    }

    alert('Borrow request sent! The admin will review it shortly.')
        renderBooks()
        renderRequests()
  }

  // ── Auto-import Book1.xlsx if needed (same logic as admin) ────────────────
  async function maybeAutoImportBook1() {
    try {
      const booksExisting = LibraryAuth.loadBooks() || []
      const need = booksExisting.some(function (b) { return !b || !String(b.title || '').trim() })
      if (!need) return
      const candidates = ['Book1.xlsx', './Book1.xlsx', '../Book1.xlsx', '/Book1.xlsx']
      for (var pi = 0; pi < candidates.length; pi++) {
        var p = candidates[pi]
        try {
          const res = await fetch(p, { cache: 'no-store' }); if (!res.ok) continue
          const blob = await res.blob(); if (!blob || blob.size === 0) continue
          const data = await new Promise(function (resolve, reject) {
            const reader = new FileReader()
            reader.onload  = function (e) { resolve(e.target.result) }
            reader.onerror = function (err) { reject(err) }
            reader.readAsBinaryString(blob)
          })
          const wb = XLSX.read(data, { type: 'binary' })
          const mappedAll = []
          wb.SheetNames.forEach(function (sheetName, sidx) {
            const ws  = wb.Sheets[sheetName]
            const arr = XLSX.utils.sheet_to_json(ws, { defval: '' })
            if (!arr || arr.length === 0) return
            arr.forEach(function (row, i) {
              const obj = {}
              Object.keys(row).forEach(function (k) {
                const key = k.trim().toLowerCase()
                if (/title/.test(key))           obj.title    = row[k]
                else if (/author/.test(key))     obj.author   = row[k]
                else if (/isbn|issn/.test(key))  obj.isbn     = row[k]
                else if (/year|published|pub\b|publication|release/.test(key)) obj.year = row[k]
                else if (/cop(y|ies)|count/.test(key)) obj.copies = Number(row[k]) || 1
                else if (/category|genre/.test(key)) obj.category = row[k]
                else obj[k.trim()] = row[k]
              })
              obj.sheet    = sheetName
              obj.category = obj.category || sheetName
              obj.id       = Date.now().toString() + sidx + i + Math.floor(Math.random() * 1000)
              obj.copies   = obj.copies || 1
              mappedAll.push(obj)
            })
          })
          if (mappedAll.length === 0) return
          const books = LibraryAuth.loadBooks() || []
          const localMap = new Map(books.map(function (b) { return [String(b.id), b] }))
          let changed = false
          mappedAll.forEach(function (ro) {
            const nTitle = (ro.title || '').toString().trim().toLowerCase()
            const exists = books.find(function (b) { return String(b.title || '').trim().toLowerCase() === nTitle && nTitle !== '' })
            if (!exists) { localMap.set(String(ro.id), ro); changed = true }
          })
          if (changed) {
            const merged = Array.from(localMap.values())
            localStorage.setItem(LibraryAuth.BOOKS_KEY, JSON.stringify(merged))
            renderBooks(); renderRequests()
          }
          return
        } catch (err) {}
      }
    } catch (err) { console.warn('student maybeAutoImportBook1 error', err) }
  }

  // ── Student nav ────────────────────────────────────────────────────────────
  function initStudentNav() {
    const nav = document.querySelector('.student-nav'); if (!nav) return
    const navItems = nav.querySelectorAll('.nav-item')
    const views    = ['books', 'requests']

    function show(view) {
      views.forEach(function (v) {
        const el = document.getElementById(v)
        if (el) el.style.display = v === view ? '' : 'none'
      })
      navItems.forEach(function (it) {
        if (it.dataset.view === view) { it.classList.add('active'); it.setAttribute('aria-current', 'true') }
        else { it.classList.remove('active'); it.removeAttribute('aria-current') }
      })
      try { window.scrollTo({ top: 0, behavior: 'smooth' }) } catch (e) {}
    }

    navItems.forEach(function (it) {
      it.addEventListener('click', function () { show(this.dataset.view) })
    })
    show('books')
  }

  // ── Wire up search and filter ──────────────────────────────────────────────
  if (searchInput) {
    var searchTimeout = null
    searchInput.addEventListener('input', function () {
      clearTimeout(searchTimeout)
      searchTimeout = setTimeout(function () { currentPage = 1; renderBooks() }, 200)
    })
  }

  if (categoryFilter) {
    categoryFilter.addEventListener('change', function () { currentPage = 1; renderBooks() })
  }

  // ── Listen for Firebase pull events ───────────────────────────────────────
  // When firebase-sync.js pulls newer data from Firestore (e.g. admin approved
  // a request on another device), re-render both views automatically.
  window.addEventListener('libraryBooksUpdated', function () {
    currentPage = 1; renderBooks()
  })
  window.addEventListener('libraryRequestsUpdated', function () {
    renderRequests(); renderBooks()  // re-render books so borrow buttons update
  })

  // ── Initial render ─────────────────────────────────────────────────────────
  maybeAutoImportBook1().then(function () {
    renderBooks()
    renderRequests()
    initStudentNav()
  }).catch(function () {
    renderBooks()
    renderRequests()
    initStudentNav()
  })

})()