// Library System — Admin
(function () {
  const user = LibraryAuth.requireAuth(['admin'])
  if (!user) return

  const STORAGE_KEY = LibraryAuth.BOOKS_KEY
  let books = []

  const form         = document.getElementById('book-form')
  const saveBtn      = document.getElementById('save-btn')
  const clearBtn     = document.getElementById('clear-btn')
  const tableWrap    = document.getElementById('table-wrap')
  const adminSearch  = document.getElementById('admin-book-search')
  const adminPaginationWrap = document.getElementById('admin-books-pagination')
  const categorySelect  = document.getElementById('category')
  const categoryCustom  = document.getElementById('category-custom')
  const requestsWrap    = document.getElementById('requests-wrap')
  const pendingCount    = document.getElementById('pending-count')
  const excelFile       = document.getElementById('excel-file')
  const loadSampleBtn   = document.getElementById('load-sample-btn')
  const exportXlsxBtn   = document.getElementById('export-xlsx')
  const endpointInput   = document.getElementById('endpoint')
  const syncBtn         = document.getElementById('sync-btn')
  const syncStatus      = document.getElementById('sync-status')
  const logoutBtn       = document.getElementById('logout-btn')
  const welcomeText     = document.getElementById('welcome-text')

  welcomeText.textContent = 'Signed in as ' + user.name + ' — manage books and review borrow requests.'

  logoutBtn.addEventListener('click', function () {
    LibraryAuth.logout()
    window.location.href = 'login.html'
  })

  // ── Stats bar ────────────────────────────────────────────────
  function updateStats() {
    try {
      const requests = LibraryAuth.loadRequests()
      const pending  = requests.filter(r => r.status === 'pending').length
      let totalCopies = 0, availableCopies = 0
      books.forEach(function (b) {
        totalCopies += Number(b.copies) || 0
        availableCopies += LibraryAuth.getAvailableCopies(b)
      })
      const statBooks     = document.getElementById('stat-books')
      const statAvailable = document.getElementById('stat-available')
      const statPending   = document.getElementById('stat-pending')
      if (statBooks)     statBooks.textContent     = books.length.toLocaleString()
      if (statAvailable) statAvailable.textContent = availableCopies.toLocaleString()
      if (statPending)   statPending.textContent   = pending.toLocaleString()
    } catch (e) {}
  }

  function loadBooks() {
    books = LibraryAuth.loadBooks()
    try {
      let changed = false
      books.forEach(function (b) {
        if (!b) return
        if (!b.year || String(b.year).trim() === '') {
          for (let k of Object.keys(b)) {
            const y = extractYear(b[k])
            if (y && /^(19|20)\d{2}$/.test(String(y))) { b.year = y; changed = true; break }
          }
        }
      })
      if (changed) saveBooks()
    } catch (err) {}
    updateAdminCategoryOptions()
  }

  function saveBooks() {
    LibraryAuth.saveBooks ? LibraryAuth.saveBooks(books) : localStorage.setItem(STORAGE_KEY, JSON.stringify(books))
  }

  function dedupeStoredBooks() {
    try {
      if (!Array.isArray(books) || books.length === 0) return { merged: 0, originals: 0 }
      function norm(s) {
        if (!s) return ''
        try { return String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }
        catch (e) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }
      }
      const map = new Map(); let merged = 0
      books.forEach(function (b) {
        if (!b) return
        const isbnKey = (b.isbn || '').toString().trim()
        const key = isbnKey ? 'isbn:' + isbnKey : 't:' + norm(b.title || '') + '|a:' + norm(b.author || '')
        if (!map.has(key)) {
          map.set(key, Object.assign({}, b))
        } else {
          const existing = map.get(key)
          existing.copies = (Number(existing.copies) || 0) + (Number(b.copies) || 0)
          if (!existing.title  && b.title)    existing.title    = b.title
          if (!existing.author && b.author)   existing.author   = b.author
          if (!existing.isbn   && b.isbn)     existing.isbn     = b.isbn
          if (!existing.year   && b.year)     existing.year     = b.year
          if (!existing.category && b.category) existing.category = b.category
          if (!existing.sheet  && b.sheet)    existing.sheet    = b.sheet
          merged++
        }
      })
      const originals = books.length
      const deduped = Array.from(map.values())
      if (merged > 0) {
        books = deduped; saveBooks(); updateAdminCategoryOptions()
        console.log('Dedupe: merged', merged, 'into', books.length, '(from', originals + ')')
        try { alert('Cleaned up ' + merged + ' duplicate book entries. Now ' + books.length + ' unique records remain.') } catch (e) {}
      }
      return { merged, originals }
    } catch (err) { console.warn('dedupeStoredBooks error', err); return { merged: 0, originals: 0 } }
  }

  function preferredOrder() { return ['id', 'title', 'author', 'isbn', 'year', 'copies', 'category'] }

  function getAllColumns() {
    const cols = new Set()
    books.forEach(b => Object.keys(b).forEach(k => cols.add(k)))
    const pref = preferredOrder(); const ordered = []
    pref.forEach(p => { if (cols.has(p)) { ordered.push(p); cols.delete(p) } })
    return ordered.concat(Array.from(cols))
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  function extractYear(val) {
    if (val === null || typeof val === 'undefined') return ''
    if (Object.prototype.toString.call(val) === '[object Date]') { try { return String(val.getFullYear()) } catch (e) {} }
    if (typeof val === 'number') { if (val > 1000 && val < 3000) return String(val) }
    const s = String(val).trim(); if (!s) return ''
    const m = s.match(/(19|20)\d{2}/); if (m) return m[0]
    const parts = s.split(/[\-\/\.]/).map(p => p.trim())
    for (let i = parts.length - 1; i >= 0; i--) { if (/^(19|20)\d{2}$/.test(parts[i])) return parts[i] }
    return s
  }

  function updateAdminCategoryOptions(selected) {
    if (!categorySelect) return
    const cats = new Set()
    books.forEach(b => { const c = String(b.category || '').trim(); if (c) cats.add(c) })
    const current = selected !== undefined ? String(selected) : categorySelect.value || ''
    categorySelect.innerHTML = ''
    const none = document.createElement('option'); none.value = ''; none.textContent = '(none)'; categorySelect.appendChild(none)
    Array.from(cats).sort().forEach(c => {
      const o = document.createElement('option'); o.value = c; o.textContent = c; categorySelect.appendChild(o)
    })
    const other = document.createElement('option'); other.value = '__other__'; other.textContent = 'Other…'; categorySelect.appendChild(other)
    if (current) {
      const found = Array.from(categorySelect.options).some(o => o.value === current)
      if (found) { categorySelect.value = current; if (categoryCustom) categoryCustom.style.display = 'none' }
      else { categorySelect.value = '__other__'; if (categoryCustom) { categoryCustom.style.display = 'block'; categoryCustom.value = current } }
    } else { categorySelect.value = ''; if (categoryCustom) categoryCustom.style.display = 'none' }
  }

  function renderTable() {
    const q = String(adminSearch ? adminSearch.value : '').trim().toLowerCase()
    const filtered = books.filter(b => !q || (
      String(b.title || '').toLowerCase().includes(q) ||
      String(b.author || '').toLowerCase().includes(q) ||
      String(b.isbn || '').toLowerCase().includes(q) ||
      String(b.category || '').toLowerCase().includes(q)
    ))
    const totalItems = filtered.length
    if (totalItems === 0) {
      tableWrap.innerHTML = '<p class="muted" style="padding:16px 0;">No books match your search.</p>'
      if (adminPaginationWrap) adminPaginationWrap.innerHTML = ''; return
    }
    const cols = getAllColumns()
    const itemsPerPage = 20
    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage))
    if (typeof window.adminCurrentPage === 'undefined') window.adminCurrentPage = 1
    if (window.adminCurrentPage > totalPages) window.adminCurrentPage = totalPages
    const startIndex = (window.adminCurrentPage - 1) * itemsPerPage
    const endIndex   = Math.min(startIndex + itemsPerPage, totalItems)
    const pageItems  = filtered.slice(startIndex, endIndex)

    let html = '<table><thead><tr><th>No.</th>'
    cols.forEach(c => { html += '<th>' + escapeHtml(c) + '</th>' })
    html += '<th>Available</th><th>Actions</th></tr></thead><tbody>'
    pageItems.forEach(function (b, idx) {
      const available = LibraryAuth.getAvailableCopies(b)
      const globalIndex = startIndex + idx + 1
      html += '<tr><td class="row-number">' + globalIndex + '</td>'
      cols.forEach(c => { html += '<td>' + escapeHtml(b[c] ?? '') + '</td>' })
      html += '<td><strong style="color:var(--green)">' + available + '</strong> / ' + (Number(b.copies) || 0) + '</td>'
      html += '<td class="center"><button class="btn-link small" data-id="' + b.id + '" data-action="edit">Edit</button> '
      html += '<button class="btn-link small reject" data-id="' + b.id + '" data-action="delete">Delete</button></td></tr>'
    })
    html += '</tbody></table>'
    tableWrap.innerHTML = html

    tableWrap.querySelectorAll('button[data-action="edit"]').forEach(btn => btn.addEventListener('click', onEdit))
    tableWrap.querySelectorAll('button[data-action="delete"]').forEach(btn => btn.addEventListener('click', onDelete))
    renderPaginationAdmin(totalPages, totalItems, startIndex, endIndex)
    updateStats()
  }

  if (adminSearch) {
    let t = null
    adminSearch.addEventListener('input', function () {
      clearTimeout(t); t = setTimeout(function () { window.adminCurrentPage = 1; renderTable() }, 150)
    })
  }

  function renderPaginationAdmin(totalPages, totalItems, startIndex, endIndex) {
    if (!adminPaginationWrap) return
    adminPaginationWrap.innerHTML = ''
    const info = document.createElement('div'); info.className = 'page-info'
    info.textContent = 'Showing ' + (totalItems ? startIndex + 1 : 0) + '–' + endIndex + ' of ' + totalItems
    if (totalPages <= 1) {
      const container = document.createElement('div'); container.className = 'pagination'
      const pageInfo = document.createElement('div'); pageInfo.className = 'page-info'; pageInfo.textContent = 'Page 1 of 1'
      container.appendChild(pageInfo); container.appendChild(info); adminPaginationWrap.appendChild(container); return
    }
    const container = document.createElement('div'); container.className = 'pagination'
    const prev = document.createElement('button'); prev.textContent = '← Prev'; prev.disabled = window.adminCurrentPage === 1
    prev.addEventListener('click', () => gotoPageAdmin(window.adminCurrentPage - 1))
    container.appendChild(prev)
    var maxButtons = 7, start = 1, end = totalPages
    if (totalPages > maxButtons) {
      start = Math.max(1, window.adminCurrentPage - 2); end = Math.min(totalPages, window.adminCurrentPage + 2)
      if (start <= 2) { start = 1; end = Math.min(totalPages, maxButtons) }
      else if (end >= totalPages - 1) { end = totalPages; start = Math.max(1, totalPages - (maxButtons - 1)) }
    }
    function addPageButton(i) {
      var b = document.createElement('button'); b.textContent = String(i)
      if (i === window.adminCurrentPage) { b.className = 'active'; b.disabled = true }
      b.addEventListener('click', () => gotoPageAdmin(i)); container.appendChild(b)
    }
    function addEllipsis() {
      var s = document.createElement('span'); s.className = 'page-ellipsis'; s.textContent = '…'
      s.style.cssText = 'padding:6px 8px;color:var(--muted)'; container.appendChild(s)
    }
    if (start > 1) { addPageButton(1); if (start > 2) addEllipsis() }
    for (var i = start; i <= end; i++) addPageButton(i)
    if (end < totalPages) { if (end < totalPages - 1) addEllipsis(); addPageButton(totalPages) }
    const next = document.createElement('button'); next.textContent = 'Next →'; next.disabled = window.adminCurrentPage === totalPages
    next.addEventListener('click', () => gotoPageAdmin(window.adminCurrentPage + 1))
    container.appendChild(next)
    const pageInfo = document.createElement('div'); pageInfo.className = 'page-info'
    pageInfo.textContent = 'Page ' + window.adminCurrentPage + ' of ' + totalPages
    adminPaginationWrap.appendChild(container); adminPaginationWrap.appendChild(pageInfo); adminPaginationWrap.appendChild(info)
  }

  function gotoPageAdmin(page) {
    if (!page || page < 1) page = 1
    window.adminCurrentPage = page; renderTable()
    try { window.scrollTo({ top: 0, behavior: 'smooth' }) } catch (e) {}
  }

  function statusBadge(status) {
    return '<span class="badge badge-' + status + '">' + escapeHtml(status) + '</span>'
  }

  function returnStatusBadge(req) {
    if (req.status !== 'approved') return ''
    if (req.returnedAt) {
      return '<span class="badge badge-approved" style="font-size:11px;">&#10003; Returned</span>'
    }
    var notified = req.returnNotifiedAt
      ? '<div style="font-size:10.5px;color:var(--amber);margin-top:3px;">Notified: ' + new Date(req.returnNotifiedAt).toLocaleDateString() + '</div>'
      : ''
    return '<span class="badge badge-pending" style="font-size:11px;">Not Returned</span>' + notified
  }

  function renderRequests() {
    var requests = LibraryAuth.loadRequests()
    var pending  = requests.filter(function (r) { return r.status === 'pending' })
    pendingCount.textContent = pending.length ? pending.length + ' pending' : ''
    var navPending = document.getElementById('nav-pending-count')
    if (navPending) navPending.textContent = pendingCount.textContent
    updateStats()
    if (requests.length === 0) { requestsWrap.innerHTML = '<p class="muted" style="padding:16px 0;">No borrow requests yet.</p>'; return }

    // Sort: pending first, then approved-not-returned, then returned/rejected
    var sorted = requests.slice().sort(function (a, b) {
      function rank(r) {
        if (r.status === 'pending') return 0
        if (r.status === 'approved' && !r.returnedAt) return 1
        if (r.status === 'approved' && r.returnedAt) return 2
        return 3
      }
      var diff = rank(a) - rank(b)
      if (diff !== 0) return diff
      return new Date(b.requestedAt) - new Date(a.requestedAt)
    })

    var html = '<table><thead><tr>'
      + '<th>Student</th><th>Course</th><th>Year / Section</th>'
      + '<th>Contact</th><th>Book</th><th>Status</th>'
      + '<th>Return Status</th><th>Requested</th><th>Actions</th>'
      + '</tr></thead><tbody>'

    sorted.forEach(function (req) {
      var actions = '—'
      if (req.status === 'pending') {
        actions = '<button class="btn-link small approve" data-id="' + req.id + '" data-action="approve">Approve</button> '
               + '<button class="btn-link small reject" data-id="' + req.id + '" data-action="reject">Reject</button>'
      } else if (req.status === 'approved' && !req.returnedAt) {
        actions = '<button class="btn-link small approve" data-id="' + req.id + '" data-action="mark-returned" style="background:var(--green-lt);border-color:#6ee7b7;color:var(--green-md);">&#10003; Mark Returned</button>'
               + ' <button class="btn-link small" data-id="' + req.id + '" data-action="notify-return" style="background:var(--amber-lt);border-color:#fcd34d;color:var(--amber);">&#128276; Notify</button>'
      } else if (req.status === 'approved' && req.returnedAt) {
        actions = '<span class="muted" style="font-size:12px;">Returned ' + new Date(req.returnedAt).toLocaleDateString() + '</span>'
      }

      // Row highlight for overdue (approved, not returned, approved > 7 days ago)
      var rowStyle = ''
      if (req.status === 'approved' && !req.returnedAt && req.reviewedAt) {
        var daysBorrowed = Math.floor((Date.now() - new Date(req.reviewedAt).getTime()) / 86400000)
        if (daysBorrowed >= 7) rowStyle = ' style="background:#fff8ed;"'
      }

      html += '<tr' + rowStyle + '>'
           + '<td>' + escapeHtml(req.userName) + '</td>'
           + '<td>' + escapeHtml(req.userCourse || '') + '</td>'
           + '<td>' + escapeHtml((req.userYear || '') + ' / ' + (req.userSection || '')) + '</td>'
           + '<td>' + escapeHtml(req.userContact || '') + '</td>'
           + '<td>' + escapeHtml(req.bookTitle) + '</td>'
           + '<td>' + statusBadge(req.status) + '</td>'
           + '<td>' + returnStatusBadge(req) + '</td>'
           + '<td>' + escapeHtml(new Date(req.requestedAt).toLocaleString()) + '</td>'
           + '<td class="center">' + actions + '</td>'
           + '</tr>'
    })
    html += '</tbody></table>'
    requestsWrap.innerHTML = html

    requestsWrap.querySelectorAll('button[data-action="approve"]').forEach(function (btn) { btn.addEventListener('click', onApprove) })
    requestsWrap.querySelectorAll('button[data-action="reject"]').forEach(function (btn) { btn.addEventListener('click', onReject) })
    requestsWrap.querySelectorAll('button[data-action="mark-returned"]').forEach(function (btn) { btn.addEventListener('click', onMarkReturned) })
    requestsWrap.querySelectorAll('button[data-action="notify-return"]').forEach(function (btn) { btn.addEventListener('click', onNotifyReturn) })
  }

  function onApprove(e) {
    var id = e.currentTarget.dataset.id
    var notes = prompt('Optional note for the student (leave blank to skip):') || ''
    var result = LibraryAuth.updateBorrowRequest(id, 'approved', notes)
    if (!result.ok) { alert(result.error); return }
    renderTable(); renderRequests()
  }

  function onReject(e) {
    var id = e.currentTarget.dataset.id
    var notes = prompt('Reason for rejection (optional):') || ''
    var result = LibraryAuth.updateBorrowRequest(id, 'rejected', notes)
    if (!result.ok) { alert(result.error); return }
    renderRequests()
  }

  function onMarkReturned(e) {
    var id = e.currentTarget.dataset.id
    if (!confirm('Mark this book as returned? This will free up one copy.')) return
    var result = LibraryAuth.markBookReturned(id)
    if (!result.ok) { alert(result.error); return }
    renderTable(); renderRequests()
  }

  function onNotifyReturn(e) {
    var id = e.currentTarget.dataset.id
    var requests = LibraryAuth.loadRequests()
    var req = requests.find(function (r) { return r.id === id })
    if (!req) return
    // Show the admin a ready-made message to relay to the student
    var daysOut = req.reviewedAt
      ? Math.floor((Date.now() - new Date(req.reviewedAt).getTime()) / 86400000)
      : 0
    var msg = 'Reminder sent to ' + req.userName + '\n\n'
      + 'Message to relay:\n'
      + '"Hi ' + req.userName + ', this is a reminder from the BCST Library to please return the book \"' + req.bookTitle + '\" that you borrowed ' + daysOut + ' day(s) ago. '
      + 'Please return it at your earliest convenience. Thank you!"'
    alert(msg)
    LibraryAuth.notifyReturn(id)
    renderRequests()
  }

  function onEdit(e) {
    const id = e.currentTarget.dataset.id
    const b = books.find(x => String(x.id) === String(id)); if (!b) return
    document.getElementById('book-id').value   = b.id
    document.getElementById('title').value     = b.title  || ''
    document.getElementById('author').value    = b.author || ''
    document.getElementById('isbn').value      = b.isbn   || ''
    document.getElementById('year').value      = b.year   || ''
    document.getElementById('copies').value    = b.copies || 1
    updateAdminCategoryOptions(b.category || '')
    saveBtn.textContent = 'Update Book'
    // Switch to add-edit view
    const navBtns = document.querySelectorAll('.nav-item')
    navBtns.forEach(btn => { if (btn.dataset.view === 'add-edit') btn.click() })
  }

  function onDelete(e) {
    const id = e.currentTarget.dataset.id
    if (!confirm('Delete this book?')) return
    books = books.filter(x => String(x.id) !== String(id))
    saveBooks(); updateAdminCategoryOptions(); renderTable()
  }

  form.addEventListener('submit', function (evt) {
    evt.preventDefault()
    const id = document.getElementById('book-id').value
    let categoryVal = ''
    if (categorySelect) {
      categoryVal = categorySelect.value || ''
      if (categoryVal === '__other__' && categoryCustom) categoryVal = categoryCustom.value.trim()
    } else { categoryVal = document.getElementById('category').value.trim() }
    const data = {
      title:    document.getElementById('title').value.trim(),
      author:   document.getElementById('author').value.trim(),
      isbn:     document.getElementById('isbn').value.trim(),
      year:     document.getElementById('year').value || '',
      copies:   Number(document.getElementById('copies').value) || 1,
      category: categoryVal || ''
    }
    if (id) {
      const idx = books.findIndex(x => String(x.id) === String(id))
      if (idx >= 0) books[idx] = Object.assign({}, books[idx], data)
      saveBtn.textContent = 'Add Book'
    } else {
      data.id = Date.now().toString() + Math.floor(Math.random() * 1000)
      books.push(data)
    }
    document.getElementById('book-id').value = ''
    form.reset(); saveBooks(); updateAdminCategoryOptions(); renderTable(); renderRequests()
  })

  clearBtn.addEventListener('click', function () {
    form.reset(); document.getElementById('book-id').value = ''; saveBtn.textContent = 'Add Book'
    if (categoryCustom) categoryCustom.style.display = 'none'
  })

  if (categorySelect) {
    categorySelect.addEventListener('change', function () {
      if (categorySelect.value === '__other__') { if (categoryCustom) { categoryCustom.style.display = 'block'; categoryCustom.focus() } }
      else { if (categoryCustom) categoryCustom.style.display = 'none' }
    })
  }

  excelFile.addEventListener('change', function (e) {
    const f = e.target.files[0]; if (!f) return; importExcel(f); e.target.value = ''
  })
  if (loadSampleBtn) loadSampleBtn.addEventListener('click', loadSample)
  exportXlsxBtn.addEventListener('click', exportXLSX)
  syncBtn.addEventListener('click', syncBooks)

  async function maybeAutoImportBook1() {
    try {
      const need = Array.isArray(books) && books.some(b => !b || !String(b.title || '').trim())
      if (!need) return
      for (let p of ['Book1.xlsx', './Book1.xlsx', '../Book1.xlsx', '/Book1.xlsx']) {
        try {
          const res = await fetch(p, { cache: 'no-store' }); if (!res.ok) continue
          const blob = await res.blob(); if (!blob || blob.size === 0) continue
          try { importExcel(new File([blob], p.split('/').pop() || 'Book1.xlsx', { type: blob.type })) }
          catch (err) { importExcel(blob) }
          console.log('Auto-imported sample from ' + p); return
        } catch (err) {}
      }
    } catch (err) { console.warn('maybeAutoImportBook1 error', err) }
  }

  async function loadSample() {
    let lastError = null
    for (let p of ['Book1.xlsx', './Book1.xlsx', '../Book1.xlsx', '/Book1.xlsx']) {
      try {
        const res = await fetch(p, { cache: 'no-store' }); if (!res.ok) continue
        const blob = await res.blob(); if (!blob || blob.size === 0) continue
        try { importExcel(new File([blob], p.split('/').pop() || 'Book1.xlsx', { type: blob.type })) }
        catch (err) { importExcel(blob) }
        alert('Loaded sample from ' + p); return
      } catch (err) { lastError = err }
    }
    alert('Could not load sample automatically. Use the Import Excel control to select Book1.xlsx manually.')
  }

  function extractYear(val) {
    if (val === null || typeof val === 'undefined') return ''
    if (Object.prototype.toString.call(val) === '[object Date]') { try { return String(val.getFullYear()) } catch (e) {} }
    if (typeof val === 'number') { if (val > 1000 && val < 3000) return String(val) }
    const s = String(val).trim(); if (!s) return ''
    const m = s.match(/(19|20)\d{2}/); if (m) return m[0]
    const parts = s.split(/[\-\/\.]/).map(p => p.trim())
    for (let i = parts.length - 1; i >= 0; i--) { if (/^(19|20)\d{2}$/.test(parts[i])) return parts[i] }
    return s
  }

  function importExcel(file) {
    const reader = new FileReader()
    reader.onload = function (e) {
      const data = e.target.result
      const wb   = XLSX.read(data, { type: 'binary' })
      const mappedAll = []
      wb.SheetNames.forEach(function (sheetName, sidx) {
        const ws  = wb.Sheets[sheetName]
        const arr = XLSX.utils.sheet_to_json(ws, { defval: '' })
        if (!arr || arr.length === 0) return
        const mapped = arr.map(function (row, i) {
          const obj = {}
          Object.keys(row).forEach(function (k) {
            const key = k.trim().toLowerCase()
            if (/title/.test(key))                                obj.title    = row[k]
            else if (/author/.test(key))                          obj.author   = row[k]
            else if (/isbn|issn/.test(key))                       obj.isbn     = row[k]
            else if (/year|^yr$|published|publication|pub\b|publi|date of publication|published date|published_on|release|released|pub date|publication date/.test(key))
                                                                   obj.year     = extractYear(row[k])
            else if (/copy|copies|count/.test(key))               obj.copies   = Number(row[k]) || 1
            else if (/category|genre/.test(key))                  obj.category = row[k]
            else obj[k.trim()] = row[k]
          })
          obj.sheet = sheetName
          if (!obj.category || String(obj.category).trim() === '') obj.category = sheetName
          if (!obj.year) {
            for (let a of ['published', 'publication date', 'pub date', 'date']) {
              for (let hk of Object.keys(row)) {
                if (String(hk).toLowerCase().includes(a) && row[hk]) {
                  const y = extractYear(row[hk]); if (y) { obj.year = y; break }
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
      if (mappedAll.length === 0) { alert('No data found in workbook'); return }

      function norm(s) {
        if (!s) return ''
        try { return String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }
        catch (e) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }
      }

      // Dedupe workbook rows
      const uniqueMapped = []; const seen = new Set()
      mappedAll.forEach(function (ro) {
        const isbnKey = (ro.isbn || '').toString().trim()
        const key = isbnKey ? 'isbn:' + isbnKey : 't:' + norm(ro.title || '') + '|a:' + norm(ro.author || '')
        if (!seen.has(key)) { seen.add(key); uniqueMapped.push(ro) }
        else {
          const idx = uniqueMapped.findIndex(u => isbnKey ? (u.isbn || '').toString().trim() === isbnKey : norm(u.title || '') === norm(ro.title || '') && norm(u.author || '') === norm(ro.author || ''))
          if (idx >= 0) { const t = uniqueMapped[idx]; Object.keys(ro).forEach(k => { if ((!t[k] || String(t[k]).trim() === '') && ro[k] !== undefined && ro[k] !== null && String(ro[k]).trim() !== '') t[k] = ro[k] }) }
        }
      })

      let mergedCount = 0, addedCount = 0, updatedFields = 0
      uniqueMapped.forEach(function (ro) {
        const imported = {
          title: (ro.title || '').toString().trim(), author: (ro.author || '').toString().trim(),
          isbn: (ro.isbn || '').toString().trim(), year: (ro.year || '').toString().trim(),
          copies: ro.copies ? Number(ro.copies) : undefined,
          category: (ro.category || '').toString().trim(), sheet: (ro.sheet || ro.category || '').toString().trim()
        }
        let found = null
        if (imported.isbn) found = books.find(b => String(b.isbn || '').trim() === imported.isbn)
        if (!found && imported.title) { const t = imported.title.toLowerCase(); found = books.find(b => String(b.title || '').trim().toLowerCase() === t) }
        if (!found && imported.title) {
          const nT = norm(imported.title), nA = norm(imported.author || '')
          found = books.find(b => { const bn = norm(b.title || ''), an = norm(b.author || ''); if (!bn) return false; return nA ? bn === nT && an === nA : bn === nT })
        }
        if (found) {
          let anyUpdated = false
          if (!found.title    && imported.title)    { found.title    = imported.title;    anyUpdated = true; updatedFields++ }
          if (!found.author   && imported.author)   { found.author   = imported.author;   anyUpdated = true; updatedFields++ }
          if (!found.isbn     && imported.isbn)     { found.isbn     = imported.isbn;     anyUpdated = true; updatedFields++ }
          if (!found.year     && imported.year)     { found.year     = imported.year;     anyUpdated = true; updatedFields++ }
          if (typeof found.copies === 'undefined' && typeof imported.copies !== 'undefined') { found.copies = Number(imported.copies) || 1; anyUpdated = true; updatedFields++ }
          if (!found.category && imported.category) { found.category = imported.category; anyUpdated = true; updatedFields++ }
          if (!found.sheet    && imported.sheet)    { found.sheet    = imported.sheet;    updatedFields++ }
          if (anyUpdated) mergedCount++
        } else {
          const nT = norm(imported.title || ''), nA = norm(imported.author || '')
          const near = books.find(b => { const bn = norm(b.title || ''), an = norm(b.author || ''); if (!bn) return false; return nA ? bn === nT && an === nA : bn === nT })
          if (near) {
            if (!near.title    && imported.title)    { near.title    = imported.title;    updatedFields++ }
            if (!near.author   && imported.author)   { near.author   = imported.author;   updatedFields++ }
            if (!near.isbn     && imported.isbn)     { near.isbn     = imported.isbn;     updatedFields++ }
            if (!near.year     && imported.year)     { near.year     = imported.year;     updatedFields++ }
            if (!near.category && imported.category) { near.category = imported.category; updatedFields++ }
            if (!near.sheet    && imported.sheet)    { near.sheet    = imported.sheet;    updatedFields++ }
            mergedCount++
          } else {
            const newObj = Object.assign({}, ro)
            if (!newObj.id) newObj.id = Date.now().toString() + Math.floor(Math.random() * 1000)
            if (!newObj.copies) newObj.copies = Number(newObj.copies) || 1
            newObj.sheet = (ro.sheet || ro.category || '').toString().trim()
            books.push(newObj); addedCount++
          }
        }
      })

      if (mergedCount + addedCount > 0) {
        saveBooks(); updateAdminCategoryOptions(); renderTable()
        alert('Imported ' + mappedAll.length + ' rows from ' + wb.SheetNames.length + ' sheets.\nMerged: ' + mergedCount + ', Added: ' + addedCount + ', Fields updated: ' + updatedFields)
      } else { alert('No rows merged or added from workbook') }
    }
    reader.readAsBinaryString(file)
  }

  function exportXLSX() {
    if (books.length === 0) { alert('No books to export'); return }
    const ws = XLSX.utils.json_to_sheet(books)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Books')
    XLSX.writeFile(wb, 'library_books.xlsx')
  }

  async function syncBooks() {
    if (!navigator.onLine) { alert('You appear to be offline — connect to the Internet to sync'); return }
    const url = endpointInput.value.trim()
    if (!url) { alert('Provide an endpoint URL to sync'); return }
    syncStatus.textContent = 'Syncing…'
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ books }) })
      syncStatus.textContent = res.ok ? 'Synced OK ✓' : 'Sync failed: ' + res.status
    } catch (err) { syncStatus.textContent = 'Sync error' }
    setTimeout(() => { syncStatus.textContent = '' }, 4000)
  }


  function initAdminNav() {
    const nav = document.querySelector('.admin-nav'); if (!nav) return
    const navItems = nav.querySelectorAll('.nav-item')
    const views = ['add-edit', 'books', 'requests', 'accounts', 'change-password']
    function show(view) {
      views.forEach(function (v) { const el = document.getElementById(v); if (el) el.style.display = v === view ? '' : 'none' })
      navItems.forEach(function (it) {
        if (it.dataset.view === view) { it.classList.add('active'); it.setAttribute('aria-current', 'true') }
        else { it.classList.remove('active'); it.removeAttribute('aria-current') }
      })
      if (view === 'accounts') renderAccounts()
      if (view === 'change-password') populateStudentSelect()
      try { window.scrollTo({ top: 0, behavior: 'smooth' }) } catch (e) {}
    }
    navItems.forEach(function (it) { it.addEventListener('click', function () { show(this.dataset.view) }) })
    show('books')
  }

  // ── Mask email: show first 3 chars + *** + @domain ────────────────────────
  function maskEmail(email) {
    if (!email || !email.includes('@')) return email || '—'
    var parts   = email.split('@')
    var local   = parts[0]
    var domain  = parts[1]
    var visible = local.slice(0, Math.min(3, local.length))
    return visible + '***@' + domain
  }

  // ── Student Accounts view ─────────────────────────────────────────────────
  var accountsWrap   = document.getElementById('accounts-wrap')
  var accountsSearch = document.getElementById('accounts-search')

  function renderAccounts(q) {
    if (!accountsWrap) return
    var users    = LibraryAuth.loadUsers()
    var students = users.filter(function (u) { return u.role === 'student' })
    q = (q !== undefined ? q : (accountsSearch ? accountsSearch.value : '')).trim().toLowerCase()

    var filtered = students.filter(function (u) {
      if (!q) return true
      return (
        String(u.name         || '').toLowerCase().includes(q) ||
        String(u.email        || '').toLowerCase().includes(q) ||
        String(u.courseStrand || '').toLowerCase().includes(q) ||
        String(u.section      || '').toLowerCase().includes(q)
      )
    })

    if (filtered.length === 0) {
      accountsWrap.innerHTML = '<p class="muted" style="padding:16px 0;">' +
        (students.length === 0 ? 'No student accounts registered yet.' : 'No accounts match your search.') +
        '</p>'
      return
    }

    accountsWrap.innerHTML = ''
    filtered.forEach(function (u) {
      var card = document.createElement('div')
      card.className = 'account-card'

      // --- info side ---
      var info = document.createElement('div')
      info.className = 'account-info'

      var nameEl = document.createElement('div')
      nameEl.className   = 'account-name'
      nameEl.textContent = u.name || '(no name)'

      var emailEl = document.createElement('div')
      emailEl.className   = 'account-email'
      emailEl.textContent = maskEmail(u.email || u.loginId || '')

      var meta = document.createElement('div')
      meta.className = 'account-meta'
      ;[u.courseStrand, u.year, u.section ? 'Sec ' + u.section : ''].forEach(function (val) {
        if (!val || !String(val).trim()) return
        var tag = document.createElement('span')
        tag.className = 'account-tag'
        tag.textContent = val
        meta.appendChild(tag)
      })

      var pwWrap = document.createElement('div')
      pwWrap.className = 'account-pw-wrap'

      var pwLabel = document.createElement('span')
      pwLabel.textContent = 'Password: '
      pwLabel.style.cssText = 'font-weight:600;font-size:12px;'

      var pwText = document.createElement('span')
      pwText.className   = 'account-pw-text'
      pwText.textContent = '••••••••'
      pwText.dataset.pw      = u.password || ''
      pwText.dataset.visible = 'false'

      var toggleBtn = document.createElement('button')
      toggleBtn.className   = 'toggle-pw-btn'
      toggleBtn.textContent = 'Show'
      toggleBtn.type        = 'button'
      toggleBtn.addEventListener('click', function () {
        if (pwText.dataset.visible === 'false') {
          pwText.textContent     = pwText.dataset.pw || '(not set)'
          pwText.dataset.visible = 'true'
          toggleBtn.textContent  = 'Hide'
        } else {
          pwText.textContent     = '••••••••'
          pwText.dataset.visible = 'false'
          toggleBtn.textContent  = 'Show'
        }
      })

      pwWrap.appendChild(pwLabel)
      pwWrap.appendChild(pwText)
      pwWrap.appendChild(toggleBtn)

      info.appendChild(nameEl)
      info.appendChild(emailEl)
      info.appendChild(meta)
      info.appendChild(pwWrap)

      // --- action side ---
      var actions = document.createElement('div')
      actions.style.cssText = 'display:flex;flex-direction:column;gap:8px;align-items:flex-end;flex-shrink:0;'

      var resetBtn = document.createElement('button')
      resetBtn.type = 'button'
      resetBtn.textContent = 'Reset Password'
      resetBtn.style.cssText = 'font-size:12px;padding:6px 12px;background:linear-gradient(135deg,#d97706,#b45309);'
      ;(function (uid) {
        resetBtn.addEventListener('click', function () {
          var navBtns = document.querySelectorAll('.nav-item')
          navBtns.forEach(function (btn) { if (btn.dataset.view === 'change-password') btn.click() })
          var sel = document.getElementById('reset-student-select')
          if (sel) {
            sel.value = uid
            var newPwInput = document.getElementById('reset-new-pw')
            if (newPwInput) newPwInput.focus()
          }
        })
      })(u.id)

      actions.appendChild(resetBtn)
      card.appendChild(info)
      card.appendChild(actions)
      accountsWrap.appendChild(card)
    })
  }

  if (accountsSearch) {
    var accT = null
    accountsSearch.addEventListener('input', function () {
      clearTimeout(accT)
      accT = setTimeout(function () { renderAccounts(accountsSearch.value) }, 180)
    })
  }

  // ── Populate student dropdown in Change Password tab ─────────────────────
  function populateStudentSelect() {
    var sel = document.getElementById('reset-student-select')
    if (!sel) return
    var users    = LibraryAuth.loadUsers()
    var students = users.filter(function (u) { return u.role === 'student' })
    var current  = sel.value
    sel.innerHTML = '<option value="">— select a student —</option>'
    students.forEach(function (u) {
      var opt = document.createElement('option')
      opt.value       = u.id
      opt.textContent = u.name + ' (' + maskEmail(u.email || u.loginId || '') + ')'
      sel.appendChild(opt)
    })
    if (current) sel.value = current
  }

  // ── Helper: show inline form message ────────────────────────────────────
  function showMsg(elId, text, type) {
    var el = document.getElementById(elId)
    if (!el) return
    el.textContent   = text
    el.className     = type
    el.style.display = 'block'
    if (type === 'success') setTimeout(function () { el.style.display = 'none' }, 3500)
  }

  // ── Admin changes their own password ─────────────────────────────────────
  var adminPwForm = document.getElementById('admin-pw-form')
  if (adminPwForm) {
    adminPwForm.addEventListener('submit', function (e) {
      e.preventDefault()
      var currentPw = document.getElementById('admin-current-pw').value
      var newPw     = document.getElementById('admin-new-pw').value.trim()
      var confirmPw = document.getElementById('admin-confirm-pw').value.trim()

      if (!currentPw || !newPw || !confirmPw) return showMsg('admin-pw-msg', 'Please fill in all fields.', 'error')
      if (newPw.length < 6)    return showMsg('admin-pw-msg', 'New password must be at least 6 characters.', 'error')
      if (newPw !== confirmPw) return showMsg('admin-pw-msg', 'New passwords do not match.', 'error')

      var users    = LibraryAuth.loadUsers()
      var adminIdx = users.findIndex(function (u) { return u.id === user.id })
      if (adminIdx < 0) return showMsg('admin-pw-msg', 'Admin account not found.', 'error')
      if (users[adminIdx].password !== currentPw) return showMsg('admin-pw-msg', 'Current password is incorrect.', 'error')

      users[adminIdx].password = newPw
      LibraryAuth.saveUsers(users)
      adminPwForm.reset()
      showMsg('admin-pw-msg', 'Password updated successfully.', 'success')
    })
  }

  // ── Admin resets a student's password ────────────────────────────────────
  var resetPwForm = document.getElementById('reset-pw-form')
  if (resetPwForm) {
    resetPwForm.addEventListener('submit', function (e) {
      e.preventDefault()
      var studentId = document.getElementById('reset-student-select').value
      var newPw     = document.getElementById('reset-new-pw').value.trim()
      var confirmPw = document.getElementById('reset-confirm-pw').value.trim()

      if (!studentId)          return showMsg('reset-pw-msg', 'Please select a student account.', 'error')
      if (!newPw || !confirmPw) return showMsg('reset-pw-msg', 'Please fill in both password fields.', 'error')
      if (newPw.length < 6)    return showMsg('reset-pw-msg', 'Password must be at least 6 characters.', 'error')
      if (newPw !== confirmPw) return showMsg('reset-pw-msg', 'Passwords do not match.', 'error')

      var users      = LibraryAuth.loadUsers()
      var studentIdx = users.findIndex(function (u) { return u.id === studentId })
      if (studentIdx < 0) return showMsg('reset-pw-msg', 'Student account not found.', 'error')

      var studentName = users[studentIdx].name || 'Student'
      users[studentIdx].password = newPw
      LibraryAuth.saveUsers(users)
      resetPwForm.reset()
      showMsg('reset-pw-msg', studentName + "'s password has been reset successfully.", 'success')
      renderAccounts()
    })
  }

  // ── Firebase pull update listeners ────────────────────────────────────────
  window.addEventListener('libraryBooksUpdated', function () {
    loadBooks(); renderTable(); renderRequests()
  })
  window.addEventListener('libraryRequestsUpdated', function () {
    renderRequests()
  })

  loadBooks()
  try { dedupeStoredBooks() } catch (e) {}
  maybeAutoImportBook1().then(function () {
    loadBooks(); renderTable(); renderRequests(); initAdminNav()
  })

  window.libraryApp = { books, saveBooks, loadBooks, renderTable, renderRequests }
})()