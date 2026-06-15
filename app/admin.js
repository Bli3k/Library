// Library System — Admin
(function () {
  const user = LibraryAuth.requireAuth(['admin'])
  if (!user) return

  const STORAGE_KEY = LibraryAuth.BOOKS_KEY
  let books = []

  const form = document.getElementById('book-form')
  const saveBtn = document.getElementById('save-btn')
  const clearBtn = document.getElementById('clear-btn')
  const tableWrap = document.getElementById('table-wrap')
  const adminSearch = document.getElementById('admin-book-search')
  const adminPaginationWrap = document.getElementById('admin-books-pagination')
  const categorySelect = document.getElementById('category')
  const categoryCustom = document.getElementById('category-custom')
  const requestsWrap = document.getElementById('requests-wrap')
  const pendingCount = document.getElementById('pending-count')
  const excelFile = document.getElementById('excel-file')
  const loadSampleBtn = document.getElementById('load-sample-btn')
  const exportXlsxBtn = document.getElementById('export-xlsx')
  const endpointInput = document.getElementById('endpoint')
  const syncBtn = document.getElementById('sync-btn')
  const syncStatus = document.getElementById('sync-status')
  const logoutBtn = document.getElementById('logout-btn')
  const welcomeText = document.getElementById('welcome-text')

  welcomeText.textContent = 'Signed in as ' + user.name + ' — manage books and review borrow requests.'

  logoutBtn.addEventListener('click', function () {
    LibraryAuth.logout()
    window.location.href = 'login.html'
  })

  function loadBooks() {
    books = LibraryAuth.loadBooks()
    // Attempt to fill missing `year` fields by scanning other properties for a 4-digit year
    try {
      let changed = false
      books.forEach(function (b) {
        if (!b) return
        if (!b.year || String(b.year).trim() === '') {
          // look through all values for a year-looking token
          for (let k of Object.keys(b)) {
            const v = b[k]
            const y = extractYear(v)
            if (y && /^(19|20)\d{2}$/.test(String(y))) {
              b.year = y
              changed = true
              break
            }
          }
        }
      })
      if (changed) saveBooks()
    } catch (err) {}
    updateAdminCategoryOptions()
  }

  function saveBooks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(books))
  }

  // Merge duplicate books already stored (by ISBN or normalized title+author)
  function dedupeStoredBooks() {
    try {
      if (!Array.isArray(books) || books.length === 0) return { merged: 0, originals: 0 }
      function normalizeForMatch(s) {
        if (!s) return ''
        try {
          return String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
        } catch (e) {
          return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
        }
      }
      const map = new Map()
      let merged = 0
      books.forEach(function (b) {
        if (!b) return
        const isbnKey = (b.isbn || '').toString().trim()
        const titleKey = normalizeForMatch(b.title || '')
        const authorKey = normalizeForMatch(b.author || '')
        const key = isbnKey ? 'isbn:' + isbnKey : 't:' + titleKey + '|a:' + authorKey
        if (!map.has(key)) {
          // shallow clone to avoid mutating originals during iteration
          map.set(key, Object.assign({}, b))
        } else {
          const existing = map.get(key)
          // sum copies (treat duplicate rows as additional copies)
          existing.copies = (Number(existing.copies) || 0) + (Number(b.copies) || 0)
          // fill missing fields
          if ((!existing.title || String(existing.title).trim() === '') && b.title) existing.title = b.title
          if ((!existing.author || String(existing.author).trim() === '') && b.author) existing.author = b.author
          if ((!existing.isbn || String(existing.isbn).trim() === '') && b.isbn) existing.isbn = b.isbn
          if ((!existing.year || String(existing.year).trim() === '') && b.year) existing.year = b.year
          if ((!existing.category || String(existing.category).trim() === '') && b.category) existing.category = b.category
          if ((!existing.sheet || String(existing.sheet).trim() === '') && b.sheet) existing.sheet = b.sheet
          merged++
        }
      })
      const originals = books.length
      const deduped = Array.from(map.values())
      if (merged > 0) {
        books = deduped
        saveBooks()
        updateAdminCategoryOptions()
        console.log('Dedupe: merged', merged, 'duplicate rows into', books.length, 'records (from', originals, ')')
        try { alert('Cleaned up ' + merged + ' duplicate book entries. Now ' + books.length + ' unique records remain.') } catch (e) {}
      }
      return { merged, originals }
    } catch (err) {
      console.warn('dedupeStoredBooks error', err)
      return { merged: 0, originals: Array.isArray(books) ? books.length : 0 }
    }
  }

  function preferredOrder() {
    return ['id', 'title', 'author', 'isbn', 'year', 'copies', 'category']
  }

  function getAllColumns() {
    const cols = new Set()
    books.forEach(function (b) {
      Object.keys(b).forEach(function (k) {
        cols.add(k)
      })
    })
    const pref = preferredOrder()
    const ordered = []
    pref.forEach(function (p) {
      if (cols.has(p)) {
        ordered.push(p)
        cols.delete(p)
      }
    })
    return ordered.concat(Array.from(cols))
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  // Extract a year (YYYY) from a variety of inputs (Date, number, or text)
  function extractYear(val) {
    if (val === null || typeof val === 'undefined') return ''
    if (Object.prototype.toString.call(val) === '[object Date]') {
      try { return String(val.getFullYear()) } catch (e) {}
    }
    if (typeof val === 'number') {
      if (val > 1000 && val < 3000) return String(val)
    }
    const s = String(val).trim()
    if (!s) return ''
    const m = s.match(/(19|20)\d{2}/)
    if (m) return m[0]
    const parts = s.split(/[\-\/\.]/).map(function (p) { return p.trim() })
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      if (/^(19|20)\d{2}$/.test(p)) return p
    }
    return s
  }

  function updateAdminCategoryOptions(selected) {
    if (!categorySelect) return
    const cats = new Set()
    books.forEach(function (b) {
      const c = String(b.category || '').trim()
      if (c) cats.add(c)
    })
    const current = selected !== undefined ? String(selected) : categorySelect.value || ''
    // rebuild options
    categorySelect.innerHTML = ''
    const none = document.createElement('option')
    none.value = ''
    none.textContent = '(none)'
    categorySelect.appendChild(none)
    Array.from(cats)
      .sort()
      .forEach(function (c) {
        const o = document.createElement('option')
        o.value = c
        o.textContent = c
        categorySelect.appendChild(o)
      })
    const other = document.createElement('option')
    other.value = '__other__'
    other.textContent = 'Other...'
    categorySelect.appendChild(other)

    if (current) {
      const found = Array.from(categorySelect.options).some(function (o) {
        return o.value === current
      })
      if (found) {
        categorySelect.value = current
        if (categoryCustom) categoryCustom.style.display = 'none'
      } else {
        categorySelect.value = '__other__'
        if (categoryCustom) {
          categoryCustom.style.display = 'block'
          categoryCustom.value = current
        }
      }
    } else {
      categorySelect.value = ''
      if (categoryCustom) categoryCustom.style.display = 'none'
    }
  }

  function renderTable() {
    const q = String(adminSearch ? adminSearch.value : '').trim().toLowerCase()
    const filtered = books.filter(function (b) {
      if (!q) return true
      return (
        String(b.title || '').toLowerCase().includes(q) ||
        String(b.author || '').toLowerCase().includes(q) ||
        String(b.isbn || '').toLowerCase().includes(q) ||
        String(b.category || '').toLowerCase().includes(q)
      )
    })

    const totalItems = filtered.length
    if (totalItems === 0) {
      tableWrap.innerHTML = '<p class="muted">No books match your search.</p>'
      if (adminPaginationWrap) adminPaginationWrap.innerHTML = ''
      return
    }

    const cols = getAllColumns()
    // pagination
    const itemsPerPage = 20
    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage))
    if (typeof window.adminCurrentPage === 'undefined') window.adminCurrentPage = 1
    if (window.adminCurrentPage > totalPages) window.adminCurrentPage = totalPages
    const startIndex = (window.adminCurrentPage - 1) * itemsPerPage
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems)
    const pageItems = filtered.slice(startIndex, endIndex)

    let html = '<table><thead><tr><th>No.</th>'
    cols.forEach(function (c) {
      html += '<th>' + escapeHtml(c) + '</th>'
    })
    html += '<th>Available</th><th>Actions</th></tr></thead><tbody>'
    pageItems.forEach(function (b, idx) {
      const available = LibraryAuth.getAvailableCopies(b)
      const globalIndex = startIndex + idx + 1
      html += '<tr>'
      html += '<td class="row-number">' + globalIndex + '</td>'
      cols.forEach(function (c) {
        html += '<td>' + escapeHtml(b[c] ?? '') + '</td>'
      })
      html +=
        '<td>' +
        available +
        ' / ' +
        (Number(b.copies) || 0) +
        '</td><td class="center"><button class="btn-link small" data-id="' +
        b.id +
        '" data-action="edit">Edit</button> <button class="btn-link small" data-id="' +
        b.id +
        '" data-action="delete">Delete</button></td>'
      html += '</tr>'
    })
    html += '</tbody></table>'
    tableWrap.innerHTML = html

    tableWrap.querySelectorAll('button[data-action="edit"]').forEach(function (btn) {
      btn.addEventListener('click', onEdit)
    })
    tableWrap.querySelectorAll('button[data-action="delete"]').forEach(function (btn) {
      btn.addEventListener('click', onDelete)
    })

    renderPaginationAdmin(totalPages, totalItems, startIndex, endIndex)
  }

  if (adminSearch) {
    let t = null
    adminSearch.addEventListener('input', function () {
      clearTimeout(t)
      t = setTimeout(function () {
        window.adminCurrentPage = 1
        renderTable()
      }, 150)
    })
  }

  function renderPaginationAdmin(totalPages, totalItems, startIndex, endIndex) {
    if (!adminPaginationWrap) return
    adminPaginationWrap.innerHTML = ''

    const info = document.createElement('div')
    info.className = 'page-info'
    info.textContent = 'Showing ' + (totalItems ? startIndex + 1 : 0) + '–' + endIndex + ' of ' + totalItems

    if (totalPages <= 1) {
      const container = document.createElement('div')
      container.className = 'pagination'
      const pageInfo = document.createElement('div')
      pageInfo.className = 'page-info'
      pageInfo.textContent = 'Page 1 of 1'
      container.appendChild(pageInfo)
      container.appendChild(info)
      adminPaginationWrap.appendChild(container)
      return
    }

    const container = document.createElement('div')
    container.className = 'pagination'

    const prev = document.createElement('button')
    prev.textContent = 'Prev'
    prev.disabled = window.adminCurrentPage === 1
    prev.addEventListener('click', function () {
      gotoPageAdmin(window.adminCurrentPage - 1)
    })
    container.appendChild(prev)

    // numbered buttons
    var maxButtons = 7
    var start = 1
    var end = totalPages
    if (totalPages > maxButtons) {
      start = Math.max(1, window.adminCurrentPage - 2)
      end = Math.min(totalPages, window.adminCurrentPage + 2)
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
      if (i === window.adminCurrentPage) {
        b.className = 'active'
        b.disabled = true
      }
      b.addEventListener('click', function () {
        gotoPageAdmin(i)
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
    next.disabled = window.adminCurrentPage === totalPages
    next.addEventListener('click', function () {
      gotoPageAdmin(window.adminCurrentPage + 1)
    })
    container.appendChild(next)

    const pageInfo = document.createElement('div')
    pageInfo.className = 'page-info'
    pageInfo.textContent = 'Page ' + window.adminCurrentPage + ' of ' + totalPages

    adminPaginationWrap.appendChild(container)
    adminPaginationWrap.appendChild(pageInfo)
    adminPaginationWrap.appendChild(info)
  }

  function gotoPageAdmin(page) {
    if (!page || page < 1) page = 1
    window.adminCurrentPage = page
    renderTable()
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {}
  }

  function statusBadge(status) {
    return '<span class="badge badge-' + status + '">' + escapeHtml(status) + '</span>'
  }

  function renderRequests() {
    const requests = LibraryAuth.loadRequests()
    const pending = requests.filter(function (r) {
      return r.status === 'pending'
    })
    pendingCount.textContent = pending.length ? pending.length + ' pending' : ''
    // sync nav pending count (if nav exists)
    const navPending = document.getElementById('nav-pending-count')
    if (navPending) navPending.textContent = pendingCount.textContent

    if (requests.length === 0) {
      requestsWrap.innerHTML = '<p class="muted">No borrow requests yet.</p>'
      return
    }

    const sorted = requests.slice().sort(function (a, b) {
      if (a.status === 'pending' && b.status !== 'pending') return -1
      if (a.status !== 'pending' && b.status === 'pending') return 1
      return new Date(b.requestedAt) - new Date(a.requestedAt)
    })

    let html =
      '<table><thead><tr><th>Student</th><th>Course</th><th>Year / Section</th><th>Contact</th><th>Book</th><th>Status</th><th>Requested</th><th>Actions</th></tr></thead><tbody>'

    sorted.forEach(function (req) {
      let actions = '—'
      if (req.status === 'pending') {
        actions =
          '<button class="btn-link small approve" data-id="' +
          req.id +
          '" data-action="approve">Approve</button> ' +
          '<button class="btn-link small reject" data-id="' +
          req.id +
          '" data-action="reject">Reject</button>'
      }

      html +=
        '<tr><td>' +
        escapeHtml(req.userName) +
        '</td><td>' +
        escapeHtml(req.userCourse || '') +
        '</td><td>' +
        escapeHtml((req.userYear || '') + ' / ' + (req.userSection || '')) +
        '</td><td>' +
        escapeHtml(req.userContact || '') +
        '</td><td>' +
        escapeHtml(req.bookTitle) +
        '</td><td>' +
        statusBadge(req.status) +
        '</td><td>' +
        escapeHtml(new Date(req.requestedAt).toLocaleString()) +
        '</td><td class="center">' +
        actions +
        '</td></tr>'
    })

    html += '</tbody></table>'
    requestsWrap.innerHTML = html

    
    requestsWrap.querySelectorAll('button[data-action="approve"]').forEach(function (btn) {
      btn.addEventListener('click', onApprove)
    })
    requestsWrap.querySelectorAll('button[data-action="reject"]').forEach(function (btn) {
      btn.addEventListener('click', onReject)
    })
  }

  function onApprove(e) {
    const id = e.currentTarget.dataset.id
    const notes = prompt('Optional note for the student (leave blank to skip):') || ''
    const result = LibraryAuth.updateBorrowRequest(id, 'approved', notes)
    if (!result.ok) {
      alert(result.error)
      return
    }
    renderTable()
    renderRequests()
  }

  function onReject(e) {
    const id = e.currentTarget.dataset.id
    const notes = prompt('Reason for rejection (optional):') || ''
    const result = LibraryAuth.updateBorrowRequest(id, 'rejected', notes)
    if (!result.ok) {
      alert(result.error)
      return
    }
    renderRequests()
  }

  function onEdit(e) {
    const id = e.currentTarget.dataset.id
    const b = books.find(function (x) {
      return String(x.id) === String(id)
    })
    if (!b) return
    document.getElementById('book-id').value = b.id
    document.getElementById('title').value = b.title || ''
    document.getElementById('author').value = b.author || ''
    document.getElementById('isbn').value = b.isbn || ''
    document.getElementById('year').value = b.year || ''
    document.getElementById('copies').value = b.copies || 1
    updateAdminCategoryOptions(b.category || '')
    saveBtn.textContent = 'Update Book'
  }

  function onDelete(e) {
    const id = e.currentTarget.dataset.id
    if (!confirm('Delete this book?')) return
    books = books.filter(function (x) {
      return String(x.id) !== String(id)
    })
    saveBooks()
    updateAdminCategoryOptions()
    renderTable()
  }

  form.addEventListener('submit', function (evt) {
    evt.preventDefault()
    const id = document.getElementById('book-id').value
    // determine category (supports select + custom)
    let categoryVal = ''
    if (categorySelect) {
      categoryVal = categorySelect.value || ''
      if (categoryVal === '__other__' && categoryCustom) {
        categoryVal = categoryCustom.value.trim()
      }
    } else {
      categoryVal = document.getElementById('category').value.trim()
    }
    const data = {
      title: document.getElementById('title').value.trim(),
      author: document.getElementById('author').value.trim(),
      isbn: document.getElementById('isbn').value.trim(),
      year: document.getElementById('year').value || '',
      copies: Number(document.getElementById('copies').value) || 1,
      category: categoryVal || ''
    }
    if (id) {
      const idx = books.findIndex(function (x) {
        return String(x.id) === String(id)
      })
      if (idx >= 0) {
        books[idx] = Object.assign({}, books[idx], data)
      }
      saveBtn.textContent = 'Add Book'
    } else {
      data.id = Date.now().toString() + Math.floor(Math.random() * 1000)
      books.push(data)
    }
    document.getElementById('book-id').value = ''
    form.reset()
      saveBooks()
      updateAdminCategoryOptions()
    renderTable()
    renderRequests()
  })

  clearBtn.addEventListener('click', function () {
    form.reset()
    document.getElementById('book-id').value = ''
    saveBtn.textContent = 'Add Book'
    if (categoryCustom) categoryCustom.style.display = 'none'
  })

  excelFile.addEventListener('change', function (e) {
    const f = e.target.files[0]
    if (!f) return
    importExcel(f)
    e.target.value = ''
  })

  if (loadSampleBtn) {
    loadSampleBtn.addEventListener('click', function () {
      loadSample()
    })
  }

  // Attempt to auto-import Book1.xlsx if there are books with missing titles
  async function maybeAutoImportBook1() {
    try {
      const need = Array.isArray(books) && books.some(function (b) {
        return !b || !String(b.title || '').trim()
      })
      if (!need) return
      const candidates = ['Book1.xlsx', './Book1.xlsx', '../Book1.xlsx', '/Book1.xlsx']
      for (let p of candidates) {
        try {
          const res = await fetch(p, { cache: 'no-store' })
          if (!res.ok) continue
          const blob = await res.blob()
          if (!blob || blob.size === 0) continue
          try {
            const file = new File([blob], p.split('/').pop() || 'Book1.xlsx', { type: blob.type })
            importExcel(file)
          } catch (err) {
            importExcel(blob)
          }
          console.log('Auto-imported sample from ' + p)
          return
        } catch (err) {
          console.warn('maybeAutoImportBook1 fetch failed for', p, err)
        }
      }
    } catch (err) {
      console.warn('maybeAutoImportBook1 error', err)
    }
  }

  // toggle custom category box when user selects Other...
  if (categorySelect) {
    categorySelect.addEventListener('change', function () {
      if (categorySelect.value === '__other__') {
        if (categoryCustom) {
          categoryCustom.style.display = 'block'
          categoryCustom.focus()
        }
      } else {
        if (categoryCustom) categoryCustom.style.display = 'none'
      }
    })
  }

  exportXlsxBtn.addEventListener('click', function () {
    exportXLSX()
  })
  syncBtn.addEventListener('click', function () {
    syncBooks()
  })

  async function loadSample() {
    const candidates = ['Book1.xlsx', './Book1.xlsx', '../Book1.xlsx', '/Book1.xlsx']
    let lastError = null
    for (let p of candidates) {
      try {
        const res = await fetch(p, { cache: 'no-store' })
        if (!res.ok) continue
        const blob = await res.blob()
        if (!blob || blob.size === 0) continue
        const filename = p.split('/').pop() || 'Book1.xlsx'
        try {
          const file = new File([blob], filename, { type: blob.type })
          importExcel(file)
        } catch (err) {
          // Some environments may not support File constructor; pass blob directly
          importExcel(blob)
        }
        alert('Loaded sample from ' + p)
        return
      } catch (err) {
        lastError = err
      }
    }
    alert(
      'Could not load sample automatically. Use the Import Excel control to select Book1.xlsx manually, or serve the site via a local HTTP server (e.g. run python -m http.server 8000 from the workspace root and open http://localhost:8000/app/admin.html).'
    )
    console.warn('loadSample error:', lastError)
  }

  function importExcel(file) {
    const reader = new FileReader()
    reader.onload = function (e) {
      const data = e.target.result
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
              obj.year = extractYear(row[k])
            }
            else if (/copy|copies|count/.test(key)) obj.copies = Number(row[k]) || 1
            else if (/category|genre/.test(key)) obj.category = row[k]
            else obj[k.trim()] = row[k]
          })
          // Use sheet name as category when category not provided
          // always record the originating sheet name
          obj.sheet = sheetName
          if (!obj.category || String(obj.category).trim() === '') {
            obj.category = sheetName
          }
          // final normalize year: try to extract from other fields if missing
          if (!obj.year) {
            // check common alt headings
            const alt = ['published', 'publication date', 'pub date', 'date']
            for (let a of alt) {
              for (let hk of Object.keys(row)) {
                if (String(hk).toLowerCase().includes(a) && row[hk]) {
                  const y = extractYear(row[hk])
                  if (y) {
                    obj.year = y
                    break
                  }
                }
              }
              if (obj.year) break
            }
          }
          obj.id = Date.now().toString() + sidx + i + Math.floor(Math.random() * 1000)
          if (!obj.copies) obj.copies = 1
          return obj
        })
        mappedAll.push.apply(mappedAll, mapped)
      })
      if (mappedAll.length === 0) {
        alert('No data found in workbook')
        return
      }

      // Merge imported rows into existing `books`: fill missing fields on matches, else add new
      let mergedCount = 0
      let addedCount = 0
      let updatedFields = 0

      // helper: normalize strings for better matching (remove diacritics, punctuation, collapse whitespace)
      function normalizeForMatch(s) {
        if (!s) return ''
        try {
          return String(s)
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim()
        } catch (e) {
          return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
        }
      }

      // Deduplicate rows from the workbook before merging (avoid duplicate rows in Excel)
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
          // merge non-empty fields into the first occurrence
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
        // normalize strings
        const imported = {
          title: (ro.title || '').toString().trim(),
          author: (ro.author || '').toString().trim(),
          isbn: (ro.isbn || '').toString().trim(),
          year: (ro.year || '').toString().trim(),
          copies: ro.copies ? Number(ro.copies) : (ro.copies === 0 ? 0 : undefined),
          category: (ro.category || '').toString().trim(),
          sheet: (ro.sheet || ro.category || '').toString().trim(),
          raw: ro
        }

        // try to find by ISBN first, then by title (with normalization fallback)
        let found = null
        if (imported.isbn) {
          found = books.find(function (b) {
            return String(b.isbn || '').trim() === imported.isbn
          })
        }
        if (!found && imported.title) {
          const t = imported.title.toLowerCase()
          found = books.find(function (b) {
            return String(b.title || '').trim().toLowerCase() === t
          })
        }
        // additional fuzzy match: normalized title (+optional author)
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
          // only fill missing/empty fields
          if ((!found.title || String(found.title).trim() === '') && imported.title) {
            found.title = imported.title
            anyUpdated = true
            updatedFields++
          }
          if ((!found.author || String(found.author).trim() === '') && imported.author) {
            found.author = imported.author
            anyUpdated = true
            updatedFields++
          }
          if ((!found.isbn || String(found.isbn).trim() === '') && imported.isbn) {
            found.isbn = imported.isbn
            anyUpdated = true
            updatedFields++
          }
          if ((!found.year || String(found.year).trim() === '') && imported.year) {
            found.year = imported.year
            anyUpdated = true
            updatedFields++
          }
          if ((typeof found.copies === 'undefined' || found.copies === null || String(found.copies).trim() === '') && typeof imported.copies !== 'undefined') {
            found.copies = Number(imported.copies) || 1
            anyUpdated = true
            updatedFields++
          }
          if ((!found.category || String(found.category).trim() === '') && imported.category) {
            found.category = imported.category
            anyUpdated = true
            updatedFields++
          }
          if (anyUpdated) mergedCount++
          // ensure sheet is preserved on found items
          if ((!found.sheet || String(found.sheet).trim() === '') && imported.sheet) {
            found.sheet = imported.sheet
            // count this as an updated field
            updatedFields++
          }
        } else {
          // add as new book
          // before adding, do one more normalized lookup to avoid subtle duplicates
          const normTitle = normalizeForMatch(imported.title || '')
          const normAuthor = normalizeForMatch(imported.author || '')
          const near = books.find(function (b) {
            const bn = normalizeForMatch(b.title || '')
            const an = normalizeForMatch(b.author || '')
            if (!bn) return false
            if (normAuthor) return bn === normTitle && an === normAuthor
            return bn === normTitle
          })
          if (near) {
            // merge into near
            let anyUpdated = false
            if ((!near.title || String(near.title).trim() === '') && imported.title) { near.title = imported.title; anyUpdated = true; updatedFields++ }
            if ((!near.author || String(near.author).trim() === '') && imported.author) { near.author = imported.author; anyUpdated = true; updatedFields++ }
            if ((!near.isbn || String(near.isbn).trim() === '') && imported.isbn) { near.isbn = imported.isbn; anyUpdated = true; updatedFields++ }
            if ((!near.year || String(near.year).trim() === '') && imported.year) { near.year = imported.year; anyUpdated = true; updatedFields++ }
            if ((!near.category || String(near.category).trim() === '') && imported.category) { near.category = imported.category; anyUpdated = true; updatedFields++ }
            if ((!near.sheet || String(near.sheet).trim() === '') && imported.sheet) { near.sheet = imported.sheet; updatedFields++ }
            if (anyUpdated) mergedCount++
          } else {
            const newObj = Object.assign({}, ro)
            if (!newObj.id) newObj.id = Date.now().toString() + Math.floor(Math.random() * 1000)
            if (!newObj.copies) newObj.copies = Number(newObj.copies) || 1
            // preserve sheet info when adding
            newObj.sheet = (ro.sheet || ro.category || '').toString().trim()
            books.push(newObj)
            addedCount++
          }
        }
      })

      if (mergedCount + addedCount > 0) {
        saveBooks()
        updateAdminCategoryOptions()
        renderTable()
        alert('Imported ' + mappedAll.length + ' rows from ' + wb.SheetNames.length + ' sheets. Merged: ' + mergedCount + ', Added: ' + addedCount + ', Fields updated: ' + updatedFields)
      } else {
        alert('No rows merged or added from workbook')
      }
    }
    reader.readAsBinaryString(file)
  }


  function exportXLSX() {
    if (books.length === 0) {
      alert('No books to export')
      return
    }
    const ws = XLSX.utils.json_to_sheet(books)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Books')
    XLSX.writeFile(wb, 'library_books.xlsx')
  }

  

  async function syncBooks() {
    if (!navigator.onLine) {
      alert('You appear to be offline — connect to the Internet to sync')
      return
    }
    const url = endpointInput.value.trim()
    if (!url) {
      alert('Provide an endpoint URL to sync')
      return
    }
    syncStatus.textContent = 'Syncing...'
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books })
      })
      if (res.ok) {
        syncStatus.textContent = 'Synced OK'
      } else {
        syncStatus.textContent = 'Sync failed: ' + res.status
      }
    } catch (err) {
      syncStatus.textContent = 'Sync error'
    }
    setTimeout(function () {
      syncStatus.textContent = ''
    }, 4000)
  }

  // Initialize admin nav to toggle between views (books / requests / add-edit)
  function initAdminNav() {
    const nav = document.querySelector('.admin-nav')
    if (!nav) return
    const navItems = nav.querySelectorAll('.nav-item')
    const views = ['add-edit', 'books', 'requests']
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

  loadBooks()
  // perform a one-time dedupe of stored books to merge accidental duplicates
  try { dedupeStoredBooks() } catch (e) { console.warn('dedupe on load failed', e) }
  // if Excel has updates for blank entries, import them and then render
  maybeAutoImportBook1().then(function () {
    // reload and render (importExcel will also call render/save when it finishes)
    loadBooks()
    renderTable()
    renderRequests()
    initAdminNav()
  })

  window.libraryApp = { books, saveBooks, loadBooks, renderTable, renderRequests }
})()
