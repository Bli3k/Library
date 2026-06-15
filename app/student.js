(function () {
  const user = LibraryAuth.requireAuth(['student'])
  if (!user) return

  const booksWrap = document.getElementById('books-wrap')
  const searchInput = document.getElementById('book-search')
  const categoryFilter = document.getElementById('category-filter')
  const requestsWrap = document.getElementById('requests-wrap')
  const welcomeText = document.getElementById('welcome-text')
  const logoutBtn = document.getElementById('logout-btn')
  const paginationWrap = document.getElementById('books-pagination')
  const itemsPerPage = 20
  let currentPage = 1

  welcomeText.textContent =
    'Welcome, ' +
    user.name +
    ' (' +
    user.courseStrand +
    ' — ' +
    user.year +
    ', Section ' +
    user.section +
    ')'

  logoutBtn.addEventListener('click', function () {
    LibraryAuth.logout()
    window.location.href = 'login.html'
  })

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  function statusBadge(status) {
    const cls = 'badge badge-' + status
    return '<span class="' + cls + '">' + escapeHtml(status) + '</span>'
  }

  function updateCategoryOptions() {
    if (!categoryFilter) return
    const books = LibraryAuth.loadBooks() || []
    const cats = new Set()
    // collect unique sheet names (each Excel sheet represents a category)
    books.forEach(function (b) {
      const c = String(b.sheet || '').trim()
      if (c) cats.add(c)
    })
    const current = categoryFilter.value || ''
    // rebuild options
    categoryFilter.innerHTML = ''
    const allOpt = document.createElement('option')
    allOpt.value = ''
    allOpt.textContent = 'All Sheets'
    categoryFilter.appendChild(allOpt)
    Array.from(cats)
      .sort()
      .forEach(function (c) {
        const opt = document.createElement('option')
        opt.value = c
        opt.textContent = c
        categoryFilter.appendChild(opt)
      })
    if (current && Array.from(cats).includes(current)) categoryFilter.value = current
  }

  function renderBooks(filter) {
    const books = LibraryAuth.loadBooks()
    const requests = LibraryAuth.loadRequests()

    updateCategoryOptions()

    const q = String(filter ?? (searchInput ? searchInput.value : '')).trim().toLowerCase()
    const selectedCat = categoryFilter && categoryFilter.value ? categoryFilter.value : ''
    const filtered = books.filter(function (book) {
      if (selectedCat) {
        const bookCat = String(book.sheet || '').trim()
        if (bookCat !== selectedCat) return false
      }
      if (!q) return true
      return (
        String(book.title || '').toLowerCase().includes(q) ||
        String(book.author || '').toLowerCase().includes(q) ||
        String(book.isbn || '').toLowerCase().includes(q) ||
        String(book.sheet || book.category || '').toLowerCase().includes(q)
      )
    })

    const totalItems = filtered.length
    if (totalItems === 0) {
      booksWrap.innerHTML = '<p class="muted">No books match your search.</p>'
      if (paginationWrap) paginationWrap.innerHTML = ''
      return
    }

    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage))
    if (currentPage > totalPages) currentPage = totalPages

    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems)
    const pageItems = filtered.slice(startIndex, endIndex)

    // Group page items by sheet (Excel sheet name) and render as responsive cards
    const groups = {}
    pageItems.forEach(function (book, idx) {
      const globalIndex = startIndex + idx + 1
      const cat = String(book.sheet || book.category || '').trim()
      groups[cat] = groups[cat] || []
      groups[cat].push({ book: book, index: globalIndex })
    })

    let html = ''
    Object.keys(groups)
      .sort()
      .forEach(function (cat) {
        // only show sections that have a sheet/category title
        if (!cat) return
        html += '<section class="category-section">'
        html += '<h3>' + escapeHtml(cat) + ' (' + groups[cat].length + ')</h3>'
        html += '<div class="book-grid">'
        groups[cat].forEach(function (item) {
          const book = item.book
          const globalIndex = item.index
          const available = LibraryAuth.getAvailableCopies(book)
          const pending = requests.find(function (r) {
            return (
              r.userId === user.id &&
              String(r.bookId) === String(book.id) &&
              r.status === 'pending'
            )
          })
          const approved = requests.find(function (r) {
            return (
              r.userId === user.id &&
              String(r.bookId) === String(book.id) &&
              r.status === 'approved'
            )
          })

          let action = ''
          if (approved) {
            action = '<span class="muted">Borrowed</span>'
          } else if (pending) {
            action = '<span class="muted">Request pending</span>'
          } else if (available > 0) {
            action =
              '<button class="btn-link small" data-id="' +
              escapeHtml(book.id) +
              '" data-action="borrow">Request Borrow</button>'
          } else {
            action = '<span class="muted">Unavailable</span>'
          }

          html += '<div class="book-card" data-id="' + escapeHtml(book.id) + '">'
          html += '<div style="display:flex;gap:10px;align-items:flex-start">'
          html += '<div class="book-number">' + globalIndex + '</div>'
          html += '<div>'
          const dispTitle = (book.title && String(book.title).trim()) ? book.title : ((book.sheet && String(book.sheet).trim()) ? book.sheet : (book.isbn ? 'ISBN: ' + book.isbn : 'Untitled'))
          html += '<h4>' + escapeHtml(dispTitle) + '</h4>'
          html += '<div class="book-meta">' + escapeHtml(book.author || '') + '</div>'
          if (book.year) html += '<div class="book-meta">Published: ' + escapeHtml(book.year) + '</div>'
          if (book.isbn) html += '<div class="book-meta">ISBN: ' + escapeHtml(book.isbn || '') + '</div>'
          html += '</div>'
          html += '</div>'
          html += '<div class="book-actions">'
          html += '<div class="book-availability">Available: ' + available + ' / ' + (Number(book.copies) || 0) + '</div>'
          html += action
          html += '</div>'
          html += '</div>'
        })
        html += '</div></section>'
      })

    booksWrap.innerHTML = html

    // render pagination controls
    renderPagination(totalPages, totalItems, startIndex, endIndex)

    booksWrap.querySelectorAll('button[data-action="borrow"]').forEach(function (btn) {
      btn.addEventListener('click', onBorrow)
    })
  }

  function renderPagination(totalPages, totalItems, startIndex, endIndex) {
    if (!paginationWrap) return
    paginationWrap.innerHTML = ''

    const info = document.createElement('div')
    info.className = 'page-info'
    info.textContent = 'Showing ' + (totalItems ? startIndex + 1 : 0) + '–' + endIndex + ' of ' + totalItems
    // If only one page, show simple info
    if (totalPages <= 1) {
      const container = document.createElement('div')
      container.className = 'pagination'
      const pageInfo = document.createElement('div')
      pageInfo.className = 'page-info'
      pageInfo.textContent = 'Page 1 of 1'
      container.appendChild(pageInfo)
      container.appendChild(info)
      paginationWrap.appendChild(container)
      return
    }

    const container = document.createElement('div')
    container.className = 'pagination'

    const prev = document.createElement('button')
    prev.textContent = 'Prev'
    prev.disabled = currentPage === 1
    prev.addEventListener('click', function () {
      gotoPage(currentPage - 1)
    })
    container.appendChild(prev)

    // numbered page buttons (show a sliding window)
    var maxButtons = 7
    var start = 1
    var end = totalPages
    if (totalPages > maxButtons) {
      start = Math.max(1, currentPage - 2)
      end = Math.min(totalPages, currentPage + 2)
      if (start <= 2) {
        start = 1
        end = Math.min(totalPages, maxButtons)
      } else if (end >= totalPages - 1) {
        end = totalPages
        start = Math.max(1, totalPages - (maxButtons - 1))
      }
    }

    function addPageButton(i) {
      var b = document.createElement('button')
      b.textContent = String(i)
      if (i === currentPage) {
        b.className = 'active'
        b.disabled = true
      }
      b.addEventListener('click', function () {
        gotoPage(i)
      })
      container.appendChild(b)
    }

    function addEllipsis() {
      var s = document.createElement('span')
      s.className = 'page-ellipsis'
      s.textContent = '…'
      s.style.padding = '6px 8px'
      s.style.color = 'var(--muted)'
      container.appendChild(s)
    }

    if (start > 1) {
      addPageButton(1)
      if (start > 2) addEllipsis()
    }
    for (var i = start; i <= end; i++) addPageButton(i)
    if (end < totalPages) {
      if (end < totalPages - 1) addEllipsis()
      addPageButton(totalPages)
    }

    const next = document.createElement('button')
    next.textContent = 'Next'
    next.disabled = currentPage === totalPages
    next.addEventListener('click', function () {
      gotoPage(currentPage + 1)
    })
    container.appendChild(next)

    const pageInfo = document.createElement('div')
    pageInfo.className = 'page-info'
    pageInfo.textContent = 'Page ' + currentPage + ' of ' + totalPages

    paginationWrap.appendChild(container)
    paginationWrap.appendChild(pageInfo)
    paginationWrap.appendChild(info)
  }

  function gotoPage(page) {
    if (!page || page < 1) page = 1
    currentPage = page
    renderBooks(searchInput ? searchInput.value : '')
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {}
  }

  function renderRequests() {
    const requests = LibraryAuth.loadRequests().filter(function (r) {
      return r.userId === user.id
    })

    if (requests.length === 0) {
      requestsWrap.innerHTML = '<p class="muted">You have not submitted any borrow requests yet.</p>'
      return
    }

    requests.sort(function (a, b) {
      return new Date(b.requestedAt) - new Date(a.requestedAt)
    })

    let html =
      '<table><thead><tr><th>Book</th><th>Author</th><th>Status</th><th>Requested</th><th>Reviewed</th><th>Admin Notes</th></tr></thead><tbody>'

    requests.forEach(function (req) {
      html +=
        '<tr><td>' +
        escapeHtml(req.bookTitle) +
        '</td><td>' +
        escapeHtml(req.bookAuthor || '') +
        '</td><td>' +
        statusBadge(req.status) +
        '</td><td>' +
        escapeHtml(new Date(req.requestedAt).toLocaleString()) +
        '</td><td>' +
        escapeHtml(req.reviewedAt ? new Date(req.reviewedAt).toLocaleString() : '—') +
        '</td><td>' +
        escapeHtml(req.adminNotes || '—') +
        '</td></tr>'
    })

    html += '</tbody></table>'
    requestsWrap.innerHTML = html
  }

  function onBorrow(e) {
    const bookId = e.currentTarget.dataset.id
    if (!confirm('Send a borrow request to the admin for this book?')) return

    const result = LibraryAuth.createBorrowRequest(user.id, bookId)
    if (!result.ok) {
      alert(result.error)
      return
    }

    alert('Borrow request sent! The admin will review it.')
    renderBooks()
    renderRequests()
  }

  renderBooks()
  renderRequests()

  // Initialize student nav (reuse admin nav styles)
  function initStudentNav() {
    const nav = document.querySelector('.student-nav')
    if (!nav) return
    const navItems = nav.querySelectorAll('.nav-item')
    const views = ['books', 'requests']
    function show(view) {
      views.forEach(function (v) {
        const el = document.getElementById(v)
        if (!el) return
        el.style.display = v === view ? '' : 'none'
      })
      navItems.forEach(function (it) {
        if (it.dataset.view === view) {
          it.classList.add('active')
          it.setAttribute('aria-current', 'true')
        } else {
          it.classList.remove('active')
          it.removeAttribute('aria-current')
        }
      })
      try { window.scrollTo({ top: 0, behavior: 'smooth' }) } catch (e) {}
    }
    navItems.forEach(function (it) {
      it.addEventListener('click', function () { show(this.dataset.view) })
    })
    // default to Books view
    show('books')
  }

  initStudentNav()

  // Attempt to auto-import Book1.xlsx if there are books with missing titles (student-side)
  async function maybeAutoImportBook1() {
    try {
      const booksExisting = LibraryAuth.loadBooks() || []
      const need = Array.isArray(booksExisting) && booksExisting.some(function (b) {
        return !b || !String(b.title || '').trim()
      })
      if (!need) return
      const candidates = ['Book1.xlsx', './Book1.xlsx', '../Book1.xlsx', '/Book1.xlsx']
      let lastError = null
      for (let p of candidates) {
        try {
          const res = await fetch(p, { cache: 'no-store' })
          if (!res.ok) continue
          const blob = await res.blob()
          if (!blob || blob.size === 0) continue
          const data = await new Promise(function (resolve, reject) {
            const reader = new FileReader()
            reader.onload = function (e) { resolve(e.target.result) }
            reader.onerror = function (err) { reject(err) }
            reader.readAsBinaryString(blob)
          })
          const wb = XLSX.read(data, { type: 'binary' })
          const mappedAll = []
          wb.SheetNames.forEach(function (sheetName, sidx) {
            const ws = wb.Sheets[sheetName]
            const arr = XLSX.utils.sheet_to_json(ws, { defval: '' })
            if (!arr || arr.length === 0) return
            const mapped = arr.map(function (row, i) {
              const obj = {}
              Object.keys(row).forEach(function (k) {
                const key = k.trim().toLowerCase()
                if (/title/.test(key)) obj.title = row[k]
                else if (/author/.test(key)) obj.author = row[k]
                else if (/isbn|issn/.test(key)) obj.isbn = row[k]
                else if (/year|^yr$|published|publication|pub\b|publi(cation)?|date of publication|published date|published_on|release|released|pub date|publication date/.test(key)) {
                  obj.year = row[k]
                }
                else if (/copy|copies|count/.test(key)) obj.copies = Number(row[k]) || 1
                else if (/category|genre/.test(key)) obj.category = row[k]
                else obj[k.trim()] = row[k]
              })
              // preserve originating sheet
              obj.sheet = sheetName
              if (!obj.category || String(obj.category).trim() === '') obj.category = sheetName
              obj.id = Date.now().toString() + sidx + i + Math.floor(Math.random() * 1000)
              if (!obj.copies) obj.copies = 1
              return obj
            })
            mappedAll.push.apply(mappedAll, mapped)
          })

          if (mappedAll.length === 0) {
            return
          }

          // Merge imported rows into existing `books`: first dedupe workbook rows, then merge into stored books
          let mergedCount = 0
          let addedCount = 0
          let updatedFields = 0
          const books = LibraryAuth.loadBooks() || []

          function normalizeForMatch(s) {
            if (!s) return ''
            try {
              return String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
            } catch (e) {
              return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
            }
          }

          // dedupe mappedAll by ISBN or normalized title+author
          const uniqueMapped = []
          const seen = new Set()
          mappedAll.forEach(function (ro) {
            const isbnKey = (ro.isbn || '').toString().trim()
            const titleKey = normalizeForMatch(ro.title || '')
            const authorKey = normalizeForMatch(ro.author || '')
            const key = isbnKey ? 'isbn:' + isbnKey : 't:' + titleKey + '|a:' + authorKey
            if (!seen.has(key)) {
              seen.add(key)
              uniqueMapped.push(ro)
            } else {
              // merge missing fields into existing unique entry
              const idx = uniqueMapped.findIndex(function (u) {
                if (isbnKey) return (u.isbn || '').toString().trim() === isbnKey
                return normalizeForMatch(u.title || '') === titleKey && normalizeForMatch(u.author || '') === authorKey
              })
              if (idx >= 0) {
                const target = uniqueMapped[idx]
                Object.keys(ro).forEach(function (k) {
                  if ((!target[k] || String(target[k]).trim() === '') && (ro[k] !== undefined && ro[k] !== null && String(ro[k]).trim() !== '')) {
                    target[k] = ro[k]
                  }
                })
              }
            }
          })

          uniqueMapped.forEach(function (ro) {
            const imported = {
              title: (ro.title || '').toString().trim(),
              author: (ro.author || '').toString().trim(),
              isbn: (ro.isbn || '').toString().trim(),
              year: (ro.year || '').toString().trim(),
              copies: ro.copies ? Number(ro.copies) : (ro.copies === 0 ? 0 : undefined),
              category: (ro.category || '').toString().trim(),
              sheet: (ro.sheet || '').toString().trim(),
              raw: ro
            }

            let found = null
            if (imported.isbn) {
              found = books.find(function (b) { return String(b.isbn || '').trim() === imported.isbn })
            }
            if (!found && imported.title) {
              const t = imported.title.toLowerCase()
              found = books.find(function (b) { return String(b.title || '').trim().toLowerCase() === t })
            }

            if (!found && imported.title) {
              const nTitle = normalizeForMatch(imported.title)
              const nAuthor = normalizeForMatch(imported.author || '')
              found = books.find(function (b) {
                const bn = normalizeForMatch(b.title || '')
                const an = normalizeForMatch(b.author || '')
                if (!bn) return false
                if (nAuthor) return bn === nTitle && an === nAuthor
                return bn === nTitle
              })
            }

            if (found) {
              let anyUpdated = false
              if ((!found.title || String(found.title).trim() === '') && imported.title) { found.title = imported.title; anyUpdated = true; updatedFields++ }
              if ((!found.author || String(found.author).trim() === '') && imported.author) { found.author = imported.author; anyUpdated = true; updatedFields++ }
              if ((!found.isbn || String(found.isbn).trim() === '') && imported.isbn) { found.isbn = imported.isbn; anyUpdated = true; updatedFields++ }
              if ((!found.year || String(found.year).trim() === '') && imported.year) { found.year = imported.year; anyUpdated = true; updatedFields++ }
              if ((typeof found.copies === 'undefined' || found.copies === null || String(found.copies).trim() === '') && typeof imported.copies !== 'undefined') { found.copies = Number(imported.copies) || 1; anyUpdated = true; updatedFields++ }
              if ((!found.category || String(found.category).trim() === '') && imported.category) { found.category = imported.category; anyUpdated = true; updatedFields++ }
              if (anyUpdated) mergedCount++
              if ((!found.sheet || String(found.sheet).trim() === '') && imported.sheet) { found.sheet = imported.sheet; updatedFields++ }
            } else {
              const newObj = Object.assign({}, ro)
              if (!newObj.id) newObj.id = Date.now().toString() + Math.floor(Math.random() * 1000)
              if (!newObj.copies) newObj.copies = Number(newObj.copies) || 1
              newObj.sheet = (ro.sheet || ro.category || '').toString().trim()
              books.push(newObj)
              addedCount++
            }
          })

          if (mergedCount + addedCount > 0) {
            try { localStorage.setItem(LibraryAuth.BOOKS_KEY, JSON.stringify(books)) } catch (e) { console.warn('save books failed', e) }
            updateCategoryOptions()
            renderBooks()
            renderRequests()
            console.log('Auto-imported', uniqueMapped.length, 'unique rows from', wb.SheetNames.length, 'sheets. Merged:', mergedCount, 'Added:', addedCount, 'Fields updated:', updatedFields)
          }
          return
        } catch (err) {
          lastError = err
        }
      }
      console.warn('maybeAutoImportBook1 lastError:', lastError)
    } catch (err) {
      console.warn('maybeAutoImportBook1 error', err)
    }
  }

  // Attempt auto-import, then render and init nav
  maybeAutoImportBook1().then(function () {
    // ensured inside maybeAutoImportBook1 we refresh views if changes applied
    renderBooks()
    renderRequests()
    initStudentNav()
  }).catch(function () {
    renderBooks()
    renderRequests()
    initStudentNav()
  })

  // wire up search
  if (searchInput) {
    let timeout = null
    searchInput.addEventListener('input', function (e) {
      clearTimeout(timeout)
      timeout = setTimeout(function () {
        currentPage = 1
        renderBooks(searchInput.value)
      }, 200)
    })
  }
  if (categoryFilter) {
    categoryFilter.addEventListener('change', function () {
      currentPage = 1
      renderBooks(searchInput ? searchInput.value : '')
    })
  }
})()
