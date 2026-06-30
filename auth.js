// Shared auth and borrow-request utilities — localStorage (primary) + Firebase (sync)
(function () {
  const USERS_KEY = 'library_users_v1'
  const SESSION_KEY = 'library_session_v1'
  const REQUESTS_KEY = 'library_borrow_requests_v1'
  const BOOKS_KEY = 'library_books_v1'
  const PW_RESET_KEY = 'library_pw_resets_v1'
  const DELETED_REQUESTS_KEY = 'library_deleted_borrow_requests_v1'
  const DELETED_BOOKS_KEY = 'library_deleted_books_v1'
  const DELETED_PW_RESET_KEY = 'library_deleted_pw_resets_v1'
  const DELETE_TOMBSTONE_TTL = 30 * 24 * 60 * 60 * 1000

  // ── Firebase SDK (loaded via CDN modules in firebase-sync.js) ──────────────
  // Firebase is optional; if window.LibraryFirebase is defined, we'll sync to it.
  // That object is populated by firebase-sync.js which loads after auth.js.

  function genSessionId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
  }

  function loadUsers() {
    try {
      const raw = localStorage.getItem(USERS_KEY)
      let users = raw ? JSON.parse(raw) : []
      let changed = false
      users = users.map(function (u) {
        if (u && !u.email) {
          if (u.loginId && /\S+@\S+\.\S+/.test(u.loginId)) {
            u.email = u.loginId; changed = true
          } else if (u.contactNumber && String(u.contactNumber).trim() !== '') {
            const slug = String(u.contactNumber).trim().replace(/\s+/g, '').replace(/[^a-zA-Z0-9._+-]/g, '')
            u.email = slug + '@phone.local'
            if (!u.loginId || u.loginId === u.contactNumber) u.loginId = u.email
            changed = true
          }
        }
        return u
      })
      if (changed) saveUsers(users)
      return users
    } catch (e) { return [] }
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users))
    // Firebase sync (non-blocking, debounced)
    try {
      if (window.LibraryFirebase && window.LibraryFirebase.syncUsers) {
        window.LibraryFirebase.syncUsers(users)
      }
    } catch (e) {}
  }

  function saveUsersImmediate(users) {
    // Bypasses debounce — used at registration so admin sees new student instantly
    localStorage.setItem(USERS_KEY, JSON.stringify(users))
    try {
      if (window.LibraryFirebase && window.LibraryFirebase.syncUsersNow) {
        window.LibraryFirebase.syncUsersNow(users)
      } else if (window.LibraryFirebase && window.LibraryFirebase.syncUsers) {
        window.LibraryFirebase.syncUsers(users)
      }
    } catch (e) {}
  }

  function loadSession() {
    try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null }
    catch (e) { return null }
  }

  function saveSession(session) {
    try {
      if (session) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session))
        localStorage.setItem('library_active_session_' + session.userId, session.sessionId)
        // sessionStorage deliberately omitted — wiped on Electron file:// navigation
      } else {
        const old = loadSession()
        if (old && old.userId) {
          try {
            const key = 'library_active_session_' + old.userId
            const active = localStorage.getItem(key)
            if (active && active === old.sessionId) localStorage.removeItem(key)
          } catch (e) {}
        }
        localStorage.removeItem(SESSION_KEY)
        // sessionStorage deliberately omitted — wiped on Electron file:// navigation
      }
    } catch (e) {
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
      else localStorage.removeItem(SESSION_KEY)
    }
  }

  function loadRequests() {
    try { const raw = localStorage.getItem(REQUESTS_KEY); return raw ? JSON.parse(raw) : [] }
    catch (e) { return [] }
  }

  function loadDeletedMap(key) {
    try {
      var raw = localStorage.getItem(key)
      var parsed = raw ? JSON.parse(raw) : {}
      var now = Date.now()
      var changed = false
      var map = {}
      if (Array.isArray(parsed)) {
        parsed.forEach(function (id) { if (id) map[String(id)] = now })
        changed = parsed.length > 0
      } else if (parsed && typeof parsed === 'object') {
        Object.keys(parsed).forEach(function (id) {
          var ts = Number(parsed[id]) || now
          if (now - ts <= DELETE_TOMBSTONE_TTL) map[id] = ts
          else changed = true
        })
      }
      if (changed) localStorage.setItem(key, JSON.stringify(map))
      return map
    } catch (e) { return {} }
  }

  function getDeletedIds(key) {
    return Object.keys(loadDeletedMap(key))
  }

  function rememberDeleted(key, id) {
    if (!id) return
    var map = loadDeletedMap(key)
    map[String(id)] = Date.now()
    try { localStorage.setItem(key, JSON.stringify(map)) } catch (e) {}
  }

  function flushPendingDeletes() {
    try {
      if (!window.LibraryFirebase) return
      getDeletedIds(DELETED_REQUESTS_KEY).forEach(function (id) {
        if (window.LibraryFirebase.deleteRequest) window.LibraryFirebase.deleteRequest(id)
      })
      getDeletedIds(DELETED_BOOKS_KEY).forEach(function (id) {
        if (window.LibraryFirebase.deleteBook) window.LibraryFirebase.deleteBook(id)
      })
      getDeletedIds(DELETED_PW_RESET_KEY).forEach(function (id) {
        if (window.LibraryFirebase.deletePwReset) window.LibraryFirebase.deletePwReset(id)
      })
    } catch (e) {}
  }

  function saveRequests(requests) {
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests))
    try {
      if (window.LibraryFirebase && window.LibraryFirebase.syncRequests) {
        window.LibraryFirebase.syncRequests(requests)
      }
    } catch (e) {}
  }

  function saveRequestsImmediate(requests) {
    // Bypasses debounce — used for approve/reject so the other device sees it instantly
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests))
    try {
      if (window.LibraryFirebase && window.LibraryFirebase.syncRequestsNow) {
        window.LibraryFirebase.syncRequestsNow(requests)
      } else if (window.LibraryFirebase && window.LibraryFirebase.syncRequests) {
        window.LibraryFirebase.syncRequests(requests)
      }
    } catch (e) {}
  }

  function loadBooks() {
    try { const raw = localStorage.getItem(BOOKS_KEY); return raw ? JSON.parse(raw) : [] }
    catch (e) { return [] }
  }

  function saveBooks(books) {
    localStorage.setItem(BOOKS_KEY, JSON.stringify(books))
    try {
      if (window.LibraryFirebase && window.LibraryFirebase.syncBooks) {
        window.LibraryFirebase.syncBooks(books)
      }
    } catch (e) {}
  }

  function ensureDefaultAdmin() {
    const users = loadUsers()
    const idx = users.findIndex((u) => u.loginId === 'admin' && u.role === 'admin')
    if (idx >= 0) {
      if (!users[idx].password) {
        users[idx].password = 'admin123'; saveUsers(users)
      }
      return
    }
    users.push({
      id: 'admin-default', loginId: 'admin', password: 'admin123', role: 'admin',
      name: 'Administrator', age: '', courseStrand: '', year: '', section: '',
      address: '', contactNumber: '', email: '', createdAt: new Date().toISOString()
    })
    saveUsers(users)
  }

  function register(userData) {
    const users = loadUsers()
    const email = (userData.email || '').trim()
    if (!email) return { ok: false, error: 'Email is required.' }
    const loginId = email
    if (users.some((u) => u.loginId === loginId)) return { ok: false, error: 'An account with this email already exists.' }
    const user = {
      id: Date.now().toString() + Math.floor(Math.random() * 1000),
      loginId, password: userData.password, role: 'student',
      name: userData.name.trim(), age: Number(userData.age) || userData.age,
      courseStrand: userData.courseStrand.trim(), year: userData.year.trim(),
      section: userData.section.trim(), address: userData.address.trim(),
      contactNumber: (userData.contactNumber || '').trim(),
      email, createdAt: new Date().toISOString()
    }
    users.push(user); saveUsersImmediate(users)
    return { ok: true, user }
  }

  function login(loginId, password) {
    const users = loadUsers()
    const user = users.find((u) => u.loginId === loginId.trim() && u.password === password)
    if (!user) return { ok: false, error: 'Invalid email or password.' }
    const session = { userId: user.id, role: user.role, name: user.name, sessionId: genSessionId() }
    saveSession(session)
    return { ok: true, user, session }
  }

  function logout() { saveSession(null) }

  function getCurrentUser() {
    const session = loadSession()
    if (!session) return null
    const users = loadUsers()
    // NOTE: sessionStorage check is intentionally removed — it is wiped on every
    // Electron file:// page navigation, causing requireAuth to always return null.
    // We only verify the active session key in localStorage.
    try {
      const activeSid = localStorage.getItem('library_active_session_' + session.userId)
      if (!activeSid || activeSid !== session.sessionId) return null
    } catch (e) {}
    return users.find((u) => u.id === session.userId) || null
  }

  function requireAuth(allowedRoles) {
    const user = getCurrentUser()
    if (!user) { window.location.href = 'login.html'; return null }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      window.location.href = user.role === 'admin' ? 'admin.html' : 'student.html'; return null
    }
    return user
  }

  function getApprovedBorrowCount(bookId, requests) {
    // Only count approved requests that have NOT been returned yet
    return requests.filter((r) => String(r.bookId) === String(bookId) && r.status === 'approved' && !r.returnedAt).length
  }

  function getAvailableCopies(book) {
    const requests = loadRequests()
    const borrowed = getApprovedBorrowCount(book.id, requests)
    return Math.max(0, (Number(book.copies) || 0) - borrowed)
  }

  function getUserPendingRequest(userId, bookId, requests) {
    return requests.find((r) => r.userId === userId && String(r.bookId) === String(bookId) && r.status === 'pending')
  }

  function createBorrowRequest(userId, bookId) {
    const users = loadUsers()
    const user = users.find((u) => u.id === userId)
    const books = loadBooks()
    const book = books.find((b) => String(b.id) === String(bookId))
    if (!user || !book) return { ok: false, error: 'User or book not found.' }
    const requests = loadRequests()
    if (getAvailableCopies(book) <= 0) return { ok: false, error: 'No copies available for this book.' }
    if (getUserPendingRequest(userId, bookId, requests)) return { ok: false, error: 'You already have a pending request for this book.' }
    const request = {
      id: Date.now().toString() + Math.floor(Math.random() * 1000),
      userId: user.id, userName: user.name, userContact: user.contactNumber,
      userCourse: user.courseStrand, userYear: user.year, userSection: user.section,
      bookId: book.id, bookTitle: book.title || 'Untitled', bookAuthor: book.author || '',
      status: 'pending', requestedAt: new Date().toISOString(), reviewedAt: null, adminNotes: ''
    }
    requests.push(request); saveRequests(requests)
    return { ok: true, request }
  }

  function updateBorrowRequest(requestId, status, adminNotes) {
    const requests = loadRequests()
    const idx = requests.findIndex((r) => r.id === requestId)
    if (idx < 0) return { ok: false, error: 'Request not found.' }
    const req = requests[idx]
    if (req.status !== 'pending') return { ok: false, error: 'This request has already been reviewed.' }
    if (status === 'approved') {
      const books   = loadBooks()
      // Primary lookup by ID; fallback to title match (covers Electron race where
      // books haven't fully loaded into localStorage when the request arrives)
      let book = books.find((b) => String(b.id) === String(req.bookId))
      if (!book && req.bookTitle) {
        const titleLower = String(req.bookTitle).trim().toLowerCase()
        book = books.find((b) => String(b.title || '').trim().toLowerCase() === titleLower)
      }
      if (!book) {
        // Book ID not found but the request has title info — allow approval
        // by treating copies as effectively available (trust the request data)
        // This prevents a stale-localStorage race from blocking legitimate approvals.
        console.warn('[auth] Book not found for approval, proceeding with request data:', req.bookId, req.bookTitle)
      }
      // Count only OTHER approved (not-returned) requests for this book,
      // excluding the current request which is still pending.
      const otherApproved = requests.filter((r) =>
        String(r.bookId) === String(req.bookId) &&
        r.status === 'approved' &&
        !r.returnedAt &&
        r.id !== req.id
      ).length
      if (book) {
        const available = Math.max(0, (Number(book.copies) || 0) - otherApproved)
        if (available <= 0) return { ok: false, error: 'No copies available to approve this request.' }
      }
    }
    requests[idx] = Object.assign({}, req, {
      status,
      reviewedAt: new Date().toISOString(),
      adminNotes: adminNotes || '',
      returnedAt: null,
      returnNotifiedAt: null
    })
    saveRequestsImmediate(requests)
    return { ok: true, request: requests[idx] }
  }

  // Mark a borrowed book as returned
  function markBookReturned(requestId) {
    const requests = loadRequests()
    const idx = requests.findIndex(function (r) { return r.id === requestId })
    if (idx < 0) return { ok: false, error: 'Request not found.' }
    if (requests[idx].status !== 'approved') return { ok: false, error: 'This request is not approved.' }
    requests[idx] = Object.assign({}, requests[idx], { returnedAt: new Date().toISOString() })
    saveRequestsImmediate(requests)
    return { ok: true, request: requests[idx] }
  }

  // Record that the admin sent a return reminder notification to the student
  function notifyReturn(requestId) {
    const requests = loadRequests()
    const idx = requests.findIndex(function (r) { return r.id === requestId })
    if (idx < 0) return { ok: false, error: 'Request not found.' }
    requests[idx] = Object.assign({}, requests[idx], { returnNotifiedAt: new Date().toISOString() })
    saveRequests(requests)
    return { ok: true, request: requests[idx] }
  }

  function deleteBook(bookId) {
    var books = loadBooks()
    var filtered = books.filter(function (b) { return String(b.id) !== String(bookId) })
    if (filtered.length === books.length) return { ok: false, error: 'Book not found.' }
    rememberDeleted(DELETED_BOOKS_KEY, bookId)
    localStorage.setItem(BOOKS_KEY, JSON.stringify(filtered))
    try {
      if (window.LibraryFirebase && window.LibraryFirebase.deleteBook) {
        window.LibraryFirebase.deleteBook(bookId)
      }
    } catch (e) {}
    return { ok: true }
  }

  // ── Password reset requests ──────────────────────────────────────────────
  function loadPwResets() {
    try { var raw = localStorage.getItem(PW_RESET_KEY); return raw ? JSON.parse(raw) : [] }
    catch (e) { return [] }
  }

  function savePwResets(resets) {
    localStorage.setItem(PW_RESET_KEY, JSON.stringify(resets))
    try {
      if (window.LibraryFirebase && window.LibraryFirebase.syncPwResets) {
        window.LibraryFirebase.syncPwResets(resets)
      }
    } catch (e) {}
  }

  // Student submits a forgot-password request
  function createPasswordResetRequest(email, reason) {
    var users = loadUsers()
    var user  = users.find(function (u) { return (u.email || u.loginId || '').trim().toLowerCase() === email.trim().toLowerCase() })
    if (!user) return { ok: false, error: 'No account found with that email address.' }
    if (user.role === 'admin') return { ok: false, error: 'Admin accounts cannot use self-service reset.' }
    var resets  = loadPwResets()
    // Only allow one pending reset per user
    var already = resets.find(function (r) { return r.userId === user.id && r.status === 'pending' })
    if (already) return { ok: false, error: 'You already have a pending reset request. Please wait for the admin to respond.' }
    var req = {
      id:          Date.now().toString() + Math.floor(Math.random() * 1000),
      userId:      user.id,
      userName:    user.name,
      userEmail:   user.email || user.loginId || '',
      reason:      (reason || '').trim(),
      status:      'pending',
      requestedAt: new Date().toISOString(),
      resolvedAt:  null
    }
    resets.push(req)
    savePwResets(resets)
    return { ok: true, request: req }
  }

  // Admin resolves a reset request by setting a new password
  function resolvePasswordResetRequest(resetId, newPassword) {
    var resets = loadPwResets()
    var idx    = resets.findIndex(function (r) { return r.id === resetId })
    if (idx < 0) return { ok: false, error: 'Reset request not found.' }
    var req    = resets[idx]
    if (req.status !== 'pending') return { ok: false, error: 'This request has already been resolved.' }
    if (!newPassword || newPassword.length < 6) return { ok: false, error: 'New password must be at least 6 characters.' }
    // Update the user's password
    var users    = loadUsers()
    var userIdx  = users.findIndex(function (u) { return u.id === req.userId })
    if (userIdx < 0) return { ok: false, error: 'Student account no longer exists.' }
    users[userIdx].password = newPassword
    // Push password change to Firestore immediately so student can log in right away
    saveUsersImmediate(users)
    // Mark reset as resolved and push that too
    resets[idx] = Object.assign({}, req, { status: 'resolved', resolvedAt: new Date().toISOString() })
    // Use immediate sync so the resolved status reaches Firestore without delay
    localStorage.setItem(PW_RESET_KEY, JSON.stringify(resets))
    try {
      if (window.LibraryFirebase && window.LibraryFirebase.syncPwResetsNow) {
        window.LibraryFirebase.syncPwResetsNow(resets)
      } else if (window.LibraryFirebase && window.LibraryFirebase.syncPwResets) {
        window.LibraryFirebase.syncPwResets(resets)
      }
    } catch (e) {}
    return { ok: true }
  }

  // Admin dismisses/deletes a reset request
  function deletePasswordResetRequest(resetId) {
    var resets  = loadPwResets()
    var filtered = resets.filter(function (r) { return r.id !== resetId })
    rememberDeleted(DELETED_PW_RESET_KEY, resetId)
    savePwResets(filtered)
    try {
      if (window.LibraryFirebase && window.LibraryFirebase.deletePwReset) {
        window.LibraryFirebase.deletePwReset(resetId)
      }
    } catch (e) {}
    return { ok: true }
  }

  // Delete a student account — also tells Firebase to remove it
  function deleteUser(userId) {
    var users = loadUsers()
    var idx   = users.findIndex(function (u) { return u.id === userId })
    if (idx < 0) return { ok: false, error: 'User not found.' }
    if (users[idx].role === 'admin') return { ok: false, error: 'Cannot delete admin account.' }
    users.splice(idx, 1)
    saveUsers(users)
    // Also delete from Firestore so it does not come back on next pull
    try {
      if (window.LibraryFirebase && window.LibraryFirebase.deleteUser) {
        window.LibraryFirebase.deleteUser(userId)
      }
    } catch (e) {}
    return { ok: true }
  }

  // Delete a borrow request — also removes it from Firestore
  function deleteBorrowRequest(requestId) {
    var requests = loadRequests()
    var idx      = requests.findIndex(function (r) { return r.id === requestId })
    if (idx < 0) return { ok: false, error: 'Request not found.' }
    rememberDeleted(DELETED_REQUESTS_KEY, requestId)
    requests.splice(idx, 1)
    saveRequests(requests)
    try {
      if (window.LibraryFirebase && window.LibraryFirebase.deleteRequest) {
        window.LibraryFirebase.deleteRequest(requestId)
      }
    } catch (e) {}
    return { ok: true }
  }

  ensureDefaultAdmin()

  window.addEventListener('storage', function (e) {
    // Only check localStorage session — sessionStorage is not used (breaks Electron)
    try {
      const current = loadSession()
      if (!current) return
      const activeKey = 'library_active_session_' + current.userId
      const activeSid = localStorage.getItem(activeKey)
      if (!activeSid || activeSid !== current.sessionId) {
        saveSession(null)
        try { alert('Your account was signed in from another tab or device. You have been logged out.') } catch (er) {}
        try { window.location.href = 'login.html' } catch (er) {}
      }
    } catch (err) {}
  })

  window.addEventListener('libraryFirebaseReady', function () {
    flushPendingDeletes()
    try {
      if (window.LibraryFirebase && window.LibraryFirebase.syncPwResets) {
        window.LibraryFirebase.syncPwResets(loadPwResets())
      }
      if (window.LibraryFirebase && window.LibraryFirebase.syncUsers) {
        window.LibraryFirebase.syncUsers(loadUsers())
      }
    } catch (e) {}
  })

  window.LibraryAuth = {
    USERS_KEY, SESSION_KEY, REQUESTS_KEY, BOOKS_KEY, PW_RESET_KEY,
    DELETED_REQUESTS_KEY, DELETED_BOOKS_KEY, DELETED_PW_RESET_KEY,
    // data loaders — all exposed so firebase-sync.js can call loadUsers()
    loadUsers, saveUsers, saveUsersImmediate,
    loadSession,
    loadRequests, saveRequests,
    loadBooks, saveBooks,
    // auth actions
    register, login, logout, getCurrentUser, requireAuth,
    // borrow helpers
    getAvailableCopies, getApprovedBorrowCount,
    createBorrowRequest, updateBorrowRequest,
    markBookReturned, notifyReturn,
    deleteUser, deleteBorrowRequest, deleteBook,
    loadPwResets, savePwResets,
    createPasswordResetRequest, resolvePasswordResetRequest, deletePasswordResetRequest,
    getDeletedIds, rememberDeleted, flushPendingDeletes,
    ensureDefaultAdmin
  }
})()