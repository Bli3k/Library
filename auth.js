// Shared auth and borrow-request utilities — localStorage (primary) + Firebase (sync)
(function () {
  const USERS_KEY = 'library_users_v1'
  const SESSION_KEY = 'library_session_v1'
  const REQUESTS_KEY = 'library_borrow_requests_v1'
  const BOOKS_KEY = 'library_books_v1'

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
    // Firebase sync (non-blocking)
    try {
      if (window.LibraryFirebase && window.LibraryFirebase.syncUsers) {
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
        localStorage.setItem(
          'library_active_session_' + session.userId,
          session.sessionId
        )
      } else {
        const old = loadSession()
  
        if (old && old.userId) {
          try {
            const key = 'library_active_session_' + old.userId
            const active = localStorage.getItem(key)
  
            if (active && active === old.sessionId) {
              localStorage.removeItem(key)
            }
          } catch (e) {}
        }
  
        localStorage.removeItem(SESSION_KEY)
      }
    } catch (e) {
      if (session) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session))
      } else {
        localStorage.removeItem(SESSION_KEY)
      }
    }
  }

  function loadRequests() {
    try { const raw = localStorage.getItem(REQUESTS_KEY); return raw ? JSON.parse(raw) : [] }
    catch (e) { return [] }
  }

  function saveRequests(requests) {
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests))
    try {
      if (window.LibraryFirebase && window.LibraryFirebase.syncRequests) {
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
      if (!users[idx].password || users[idx].password !== 'admin123') {
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
    users.push(user); saveUsers(users)
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

  function logout() {
    saveSession(null)
  }

  function getCurrentUser() {
    const session = loadSession()
    if (!session) return null
    const users = loadUsers()
    // REMOVE the sessionStorage cross-check — it breaks in Electron file:// navigation
    // Just verify the active session key matches
    try {
      const activeSid = localStorage.getItem('library_active_session_' + session.userId)
      if (!activeSid || activeSid !== session.sessionId) return null
    } catch (e) {}
    return users.find((u) => u.id === session.userId) || null
  }

  function requireAuth(allowedRoles) {
    const user = getCurrentUser()
    if (!user) { window.location.replace('login.html'); return null }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      window.location.href = user.role === 'admin' ? 'admin.html' : 'student.html'; return null
    }
    return user
  }

  function getApprovedBorrowCount(bookId, requests) {
    return requests.filter((r) => String(r.bookId) === String(bookId) && r.status === 'approved').length
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
      const books = loadBooks()
      const book = books.find((b) => String(b.id) === String(req.bookId))
      if (!book || getAvailableCopies(book) <= 0) return { ok: false, error: 'No copies available to approve this request.' }
    }
    requests[idx] = Object.assign({}, req, {
      status,
      reviewedAt: new Date().toISOString(),
      adminNotes: adminNotes || '',
      returnedAt: null,
      returnNotifiedAt: null
    })
    saveRequests(requests)
    return { ok: true, request: requests[idx] }
  }

  // Mark a borrowed book as returned
  function markBookReturned(requestId) {
    const requests = loadRequests()
    const idx = requests.findIndex(function (r) { return r.id === requestId })
    if (idx < 0) return { ok: false, error: 'Request not found.' }
    if (requests[idx].status !== 'approved') return { ok: false, error: 'This request is not approved.' }
    requests[idx] = Object.assign({}, requests[idx], { returnedAt: new Date().toISOString() })
    saveRequests(requests)
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

  ensureDefaultAdmin()

  window.addEventListener('storage', function () {
    try {
      const current = loadSession()
  
      if (!current) return
  
      const activeKey = 'library_active_session_' + current.userId
      const activeSid = localStorage.getItem(activeKey)
  
      if (!activeSid || activeSid !== current.sessionId) {
        saveSession(null)
  
        try {
          alert(
            'Your account was signed in elsewhere. You have been logged out.'
          )
        } catch (e) {}
  
        try {
          window.location.replace = 'login.html'
        } catch (e) {}
      }
    } catch (err) {}
  })

  window.LibraryAuth = {
    USERS_KEY, SESSION_KEY, REQUESTS_KEY, BOOKS_KEY,
    // data loaders — all exposed so firebase-sync.js can call loadUsers()
    loadUsers, saveUsers,
    loadSession,
    loadRequests, saveRequests,
    loadBooks, saveBooks,
    // auth actions
    register, login, logout, getCurrentUser, requireAuth,
    // borrow helpers
    getAvailableCopies, getApprovedBorrowCount,
    createBorrowRequest, updateBorrowRequest,
    markBookReturned, notifyReturn,
    ensureDefaultAdmin
  }
})()