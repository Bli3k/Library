// Shared auth and borrow-request utilities (localStorage)
(function () {
  const USERS_KEY = 'library_users_v1'
  const SESSION_KEY = 'library_session_v1'
  const REQUESTS_KEY = 'library_borrow_requests_v1'
  const BOOKS_KEY = 'library_books_v1'

  // Generate a reasonably unique session id for single-tab session enforcement
  function genSessionId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
  }

  function loadUsers() {
    try {
      const raw = localStorage.getItem(USERS_KEY)
      let users = raw ? JSON.parse(raw) : []

      // Migrate legacy users that used contact numbers as loginId
      // Convert to email-based loginId when possible and add an `email` field.
      let changed = false
      users = users.map(function (u) {
        // preserve admin default and any user that already has email
        if (u && !u.email) {
          // if loginId already looks like an email, set email
          if (u.loginId && /\S+@\S+\.\S+/.test(u.loginId)) {
            u.email = u.loginId
            changed = true
          } else if (u.contactNumber && String(u.contactNumber).trim() !== '') {
            // create a stable pseudo-email from contact number
            const slug = String(u.contactNumber).trim().replace(/\s+/g, '').replace(/[^a-zA-Z0-9._+-]/g, '')
            u.email = slug + '@phone.local'
            // if loginId equals the contact number or is empty, move loginId to the new email
            if (!u.loginId || u.loginId === u.contactNumber) {
              u.loginId = u.email
            }
            changed = true
          }
        }
        return u 
      })

      if (changed) saveUsers(users)
      return users
    } catch (e) {
      return []
    }
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users))
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      return raw ? JSON.parse(raw) : null
    } catch (e) {
      return null
    }
  }

  function saveSession(session) {
    try {
      if (session) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session))
        // mark this session as the active session for the user (single active session)
        localStorage.setItem('library_active_session_' + session.userId, session.sessionId)
        // keep a per-tab token so only the tab that logged in keeps access
        try { sessionStorage.setItem('library_current_session_id', session.sessionId) } catch (e) {}
      } else {
        // clearing session: only clear the active marker if it still matches the session we had
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
        try { sessionStorage.removeItem('library_current_session_id') } catch (e) {}
      }
    } catch (e) {
      // fallback to simple behavior if storage throws
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
      else localStorage.removeItem(SESSION_KEY)
    }
  }

  function loadRequests() {
    try {
      const raw = localStorage.getItem(REQUESTS_KEY)
      return raw ? JSON.parse(raw) : []
    } catch (e) {
      return []
    }
  }

  function saveRequests(requests) {
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests))
  }

  function loadBooks() {
    try {
      const raw = localStorage.getItem(BOOKS_KEY)
      return raw ? JSON.parse(raw) : []
    } catch (e) {
      return []
    }
  }

  function ensureDefaultAdmin() {
    const users = loadUsers()
    // Ensure there is an admin account with loginId 'admin' and password 'admin123' for the demo.
    const idx = users.findIndex((u) => u.loginId === 'admin' && u.role === 'admin')
    if (idx >= 0) {
      // If admin exists but password is not the demo password, update it so the demo login works.
      if (!users[idx].password || users[idx].password !== 'admin123') {
        users[idx].password = 'admin123'
        saveUsers(users)
      }
      return
    }

    // Add default admin
    users.push({
      id: 'admin-default',
      loginId: 'admin',
      password: 'admin123',
      role: 'admin',
      name: 'Administrator',
      age: '',
      courseStrand: '',
      year: '',
      section: '',
      address: '',
      contactNumber: '',
      email: '',
      createdAt: new Date().toISOString()
    })
    saveUsers(users)
  }

  function register(userData) {
    const users = loadUsers()
    const email = (userData.email || '').trim()
    if (!email) return { ok: false, error: 'Email is required.' }
    const loginId = email
    if (users.some((u) => u.loginId === loginId)) {
      return { ok: false, error: 'An account with this email already exists.' }
    }
    const user = {
      id: Date.now().toString() + Math.floor(Math.random() * 1000),
      loginId,
      password: userData.password,
      role: 'student',
      name: userData.name.trim(),
      age: Number(userData.age) || userData.age,
      courseStrand: userData.courseStrand.trim(),
      year: userData.year.trim(),
      section: userData.section.trim(),
      address: userData.address.trim(),
      contactNumber: (userData.contactNumber || '').trim(),
      email: email,
      createdAt: new Date().toISOString()
    }
    users.push(user)
    saveUsers(users)
    return { ok: true, user }
  }

  function login(loginId, password) {
    const users = loadUsers()
    const user = users.find(
      (u) => u.loginId === loginId.trim() && u.password === password
    )
    if (!user) {
      return { ok: false, error: 'Invalid email or password.' }
    }
    const session = { userId: user.id, role: user.role, name: user.name, sessionId: genSessionId() }
    saveSession(session)
    return { ok: true, user, session }
  }

  function logout() {
    // clear our session and client token
    saveSession(null)
  }

  function getCurrentUser() {
    const session = loadSession()
    if (!session) return null
    const users = loadUsers()
    // enforce single-tab session: sessionStorage must hold the same session id
    try {
      const clientSid = sessionStorage.getItem('library_current_session_id')
      const activeSid = localStorage.getItem('library_active_session_' + session.userId)
      if (!clientSid || !activeSid || clientSid !== session.sessionId || activeSid !== session.sessionId) {
        return null
      }
    } catch (e) {}
    return users.find((u) => u.id === session.userId) || null
  }

  function requireAuth(allowedRoles) {
    const user = getCurrentUser()
    if (!user) {
      window.location.href = 'login.html'
      return null
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      window.location.href = user.role === 'admin' ? 'admin.html' : 'student.html'
      return null
    }
    return user
  }

  function getApprovedBorrowCount(bookId, requests) {
    return requests.filter(
      (r) => String(r.bookId) === String(bookId) && r.status === 'approved'
    ).length
  }

  function getAvailableCopies(book) {
    const requests = loadRequests()
    const borrowed = getApprovedBorrowCount(book.id, requests)
    const total = Number(book.copies) || 0
    return Math.max(0, total - borrowed)
  }

  function getUserPendingRequest(userId, bookId, requests) {
    return requests.find(
      (r) =>
        r.userId === userId &&
        String(r.bookId) === String(bookId) &&
        r.status === 'pending'
    )
  }

  function createBorrowRequest(userId, bookId) {
    const users = loadUsers()
    const user = users.find((u) => u.id === userId)
    const books = loadBooks()
    const book = books.find((b) => String(b.id) === String(bookId))
    if (!user || !book) {
      return { ok: false, error: 'User or book not found.' }
    }

    
    const requests = loadRequests()
    if (getAvailableCopies(book) <= 0) {
      return { ok: false, error: 'No copies available for this book.' }
    }
    if (getUserPendingRequest(userId, bookId, requests)) {
      return { ok: false, error: 'You already have a pending request for this book.' }
    }

    const request = {
      id: Date.now().toString() + Math.floor(Math.random() * 1000),
      userId: user.id,
      userName: user.name,
      userContact: user.contactNumber,
      userCourse: user.courseStrand,
      userYear: user.year,
      userSection: user.section,
      bookId: book.id,
      bookTitle: book.title || 'Untitled',
      bookAuthor: book.author || '',
      status: 'pending',
      requestedAt: new Date().toISOString(),
      reviewedAt: null,
      adminNotes: ''
    }
    requests.push(request)
    saveRequests(requests)
    return { ok: true, request }
  }

  function updateBorrowRequest(requestId, status, adminNotes) {
    const requests = loadRequests()
    const idx = requests.findIndex((r) => r.id === requestId)
    if (idx < 0) {
      return { ok: false, error: 'Request not found.' }
    }

    const req = requests[idx]
    if (req.status !== 'pending') {
      return { ok: false, error: 'This request has already been reviewed.' }
    }

    if (status === 'approved') {
      const books = loadBooks()
      const book = books.find((b) => String(b.id) === String(req.bookId))
      if (!book || getAvailableCopies(book) <= 0) {
        return { ok: false, error: 'No copies available to approve this request.' }
      }
    }

    requests[idx] = Object.assign({}, req, {
      status,
      reviewedAt: new Date().toISOString(),
      adminNotes: adminNotes || ''
    })
    saveRequests(requests)
    return { ok: true, request: requests[idx] }
  }

  ensureDefaultAdmin()

  // Listen for cross-tab storage changes to enforce single-session behavior.
  window.addEventListener('storage', function (e) {
    try {
      // If the global session was removed or changed elsewhere, check if this tab should be logged out
      const clientSid = sessionStorage.getItem('library_current_session_id')
      const current = loadSession()
      if (!current) {
        // session removed in another tab
        if (clientSid) {
          saveSession(null)
          try { alert('You have been logged out (session ended in another tab).') } catch (er) {}
          try { window.location.href = 'login.html' } catch (er) {}
        }
        return
      }
      // If the active session id for this user changed to something that does not match our tab, log out
      const activeKey = 'library_active_session_' + current.userId
      const activeSid = localStorage.getItem(activeKey)
      if (clientSid && activeSid && clientSid !== activeSid) {
        // our tab lost the active session
        saveSession(null)
        try { alert('Your account was signed in from another tab or window. You have been logged out.') } catch (er) {}
        try { window.location.href = 'login.html' } catch (er) {}
      }
    } catch (err) {}
  })

  window.LibraryAuth = {
    USERS_KEY,
    SESSION_KEY,
    REQUESTS_KEY,
    BOOKS_KEY,
    loadUsers,
    saveUsers,
    loadSession,
    loadRequests,
    saveRequests,
    loadBooks,
    register,
    login,
    logout,
    getCurrentUser,
    requireAuth,
    getAvailableCopies,
    getApprovedBorrowCount,
    createBorrowRequest,
    updateBorrowRequest,
    ensureDefaultAdmin
  }
})()
