// firebase-config.js — Firebase Firestore sync for BCST Library System
// This is the ONLY firebase script loaded by all HTML pages.
// It handles init, sync, pull, and real-time listeners.

(async function () {
  if (window.__libraryFirebaseInit) return
  window.__libraryFirebaseInit = true

  const CLIENT_TOKEN = 'bcst-library-2025'

  const firebaseConfig = {
    apiKey:            'AIzaSyAz7248dbOki2PMVs4pgp9SYWF-sBfnWck',
    authDomain:        'library-1e4eb.firebaseapp.com',
    projectId:         'library-1e4eb',
    storageBucket:     'library-1e4eb.firebasestorage.app',
    messagingSenderId: '1038418997545',
    appId:             '1:1038418997545:web:b98fc3af283de2b4c50738',
    measurementId:     'G-EDG8T6W0XH'
  }

  // ── Status pill updater — defined first so it works even if init fails ────
  function updateFirebaseStatus(state) {
    try {
      const el = document.getElementById('firebase-status')
      if (!el) return
      const states = {
        connecting: { text: '\u29D7 Syncing\u2026',    cls: 'fb-connecting' },
        synced:     { text: '\u2601 Cloud Synced',  cls: 'fb-synced'     },
        error:      { text: '\u26A0 Sync Error',    cls: 'fb-error'      },
        offline:    { text: '\u29B0 Cloud Offline', cls: 'fb-offline'    }
      }
      const s = states[state] || states.connecting
      el.textContent = s.text
      el.className   = 'firebase-status ' + s.cls
    } catch (e) {}
  }

  updateFirebaseStatus('connecting')

  // ── Helpers ───────────────────────────────────────────────────────────────
  function debounce(fn, ms) {
    var t
    return function () {
      var args = arguments
      clearTimeout(t)
      t = setTimeout(function () { fn.apply(null, args) }, ms)
    }
  }

  function sanitize(obj) {
    if (Array.isArray(obj)) return obj.map(sanitize)
    if (obj && typeof obj === 'object') {
      var out = {}
      for (var k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined) {
          out[k] = sanitize(obj[k])
        }
      }
      return out
    }
    return obj === undefined ? null : obj
  }

  function stripInternalFields(obj) {
    if (!obj || typeof obj !== 'object') return obj
    var clean = Object.assign({}, obj)
    delete clean._clientToken
    delete clean._updatedAt
    return clean
  }

  function readDeletedIdSet(key) {
    var ids = new Set()
    try {
      var raw = localStorage.getItem(key)
      var parsed = raw ? JSON.parse(raw) : {}
      if (Array.isArray(parsed)) {
        parsed.forEach(function (id) { if (id) ids.add(String(id)) })
      } else if (parsed && typeof parsed === 'object') {
        Object.keys(parsed).forEach(function (id) { ids.add(String(id)) })
      }
    } catch (e) {}
    return ids
  }

  // Splits large arrays into chunks to stay under Firestore's 500-op batch limit
  async function commitInChunks(db, items, writeBatchFn, buildFn, chunkSize) {
    chunkSize = chunkSize || 400
    for (var i = 0; i < items.length; i += chunkSize) {
      var chunk = items.slice(i, i + chunkSize)
      var batch = writeBatchFn(db)
      chunk.forEach(function (item) { buildFn(batch, item) })
      await batch.commit()
    }
  }

  // ── Main init ─────────────────────────────────────────────────────────────
  try {
    var fbApp      = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js')
    var fbStore    = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js')

    var initializeApp    = fbApp.initializeApp
    var getApps          = fbApp.getApps
    var getFirestore     = fbStore.getFirestore
    var collection       = fbStore.collection
    var doc              = fbStore.doc
    var getDocs          = fbStore.getDocs
    var deleteDoc        = fbStore.deleteDoc
    var writeBatch       = fbStore.writeBatch
    var serverTimestamp  = fbStore.serverTimestamp
    var onSnapshot       = fbStore.onSnapshot

    var app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
    var db  = getFirestore(app)

    // ── SYNC BOOKS ──────────────────────────────────────────────────────────
    var syncBooksRaw = async function (books) {
      if (!Array.isArray(books) || books.length === 0) return
      try {
        var valid = books.filter(function (b) { return b && b.id })
        await commitInChunks(db, valid, writeBatch, function (batch, b) {
          var ref  = doc(collection(db, 'books'), String(b.id))
          var data = Object.assign(sanitize(b), {
            _clientToken: CLIENT_TOKEN,
            _updatedAt:   serverTimestamp()
          })
          batch.set(ref, data, { merge: true })
        })
        updateFirebaseStatus('synced')
      } catch (e) {
        console.warn('[Firebase] syncBooks error:', e)
        updateFirebaseStatus('error')
      }
    }
    var syncBooks = debounce(syncBooksRaw, 1200)

    // ── SYNC REQUESTS ───────────────────────────────────────────────────────
    var syncRequestsRaw = async function (requests) {
      if (!Array.isArray(requests) || requests.length === 0) return
      try {
        var valid = requests.filter(function (r) { return r && r.id })
        await commitInChunks(db, valid, writeBatch, function (batch, r) {
          var ref  = doc(collection(db, 'borrowRequests'), String(r.id))
          var data = Object.assign(sanitize(r), {
            _clientToken: CLIENT_TOKEN,
            _updatedAt:   serverTimestamp()
          })
          batch.set(ref, data, { merge: true })
        })
        updateFirebaseStatus('synced')
      } catch (e) {
        console.warn('[Firebase] syncRequests error:', e)
        updateFirebaseStatus('error')
      }
    }
    var syncRequests = debounce(syncRequestsRaw, 1200)
    // Non-debounced version for approve/reject — pushes immediately
    var syncRequestsNow = syncRequestsRaw

    // Sync forgot-password requests so the admin sees them on every app.
    var syncPwResetsRaw = async function (resets) {
      if (!Array.isArray(resets) || resets.length === 0) return
      try {
        var valid = resets.filter(function (r) { return r && r.id })
        await commitInChunks(db, valid, writeBatch, function (batch, r) {
          var ref  = doc(collection(db, 'pwResetRequests'), String(r.id))
          var data = Object.assign(sanitize(r), {
            _clientToken: CLIENT_TOKEN,
            _updatedAt:   serverTimestamp()
          })
          batch.set(ref, data, { merge: true })
        })
        updateFirebaseStatus('synced')
      } catch (e) {
        console.warn('[Firebase] syncPwResets error:', e)
        updateFirebaseStatus('error')
      }
    }
    var syncPwResets = debounce(syncPwResetsRaw, 1200)

    // Sync student accounts so desktop and web app instances share logins.
    var syncUsersRaw = async function (users) {
      if (!Array.isArray(users)) return
      try {
        var safe = users
          .filter(function (u) { return u && u.id && u.role !== 'admin' })
          .map(function (u) {
            return {
              id: u.id, name: u.name || '', role: u.role || 'student',
              loginId: u.loginId || u.email || '', password: u.password || '',
              email: u.email || '', courseStrand: u.courseStrand || '',
              year: u.year || '', section: u.section || '',
              contactNumber: u.contactNumber || '', createdAt: u.createdAt || '',
              _clientToken: CLIENT_TOKEN, _updatedAt: serverTimestamp()
            }
          })
        if (!safe.length) return
        await commitInChunks(db, safe, writeBatch, function (batch, u) {
          var ref = doc(collection(db, 'users'), String(u.id))
          batch.set(ref, sanitize(u), { merge: true })
        })
      } catch (e) {
        console.warn('[Firebase] syncUsers error:', e)
      }
    }
    var syncUsers = debounce(syncUsersRaw, 2000)
    // Non-debounced — used at registration
    var syncUsersNow = syncUsersRaw

    // ── DELETE USER from Firestore ──────────────────────────────────────────
    // Called when admin deletes a student account — removes it from Firestore
    // so it does NOT come back on next pull
    async function deleteUser(userId) {
      try {
        await deleteDoc(doc(collection(db, 'users'), String(userId)))
        console.log('[Firebase] Deleted user:', userId)
      } catch (e) {
        console.warn('[Firebase] deleteUser error:', e)
      }
    }

    // ── DELETE REQUEST from Firestore ───────────────────────────────────────
    async function deleteRequest(requestId) {
      try {
        await deleteDoc(doc(collection(db, 'borrowRequests'), String(requestId)))
        console.log('[Firebase] Deleted request:', requestId)
      } catch (e) {
        console.warn('[Firebase] deleteRequest error:', e)
      }
    }

    async function deleteBook(bookId) {
      try {
        await deleteDoc(doc(collection(db, 'books'), String(bookId)))
        console.log('[Firebase] Deleted book:', bookId)
      } catch (e) {
        console.warn('[Firebase] deleteBook error:', e)
      }
    }

    async function deletePwReset(resetId) {
      try {
        await deleteDoc(doc(collection(db, 'pwResetRequests'), String(resetId)))
        console.log('[Firebase] Deleted password reset request:', resetId)
      } catch (e) {
        console.warn('[Firebase] deletePwReset error:', e)
      }
    }

    async function flushDeletedDocs() {
      try {
        var tasks = []
        readDeletedIdSet(LibraryAuth.DELETED_BOOKS_KEY).forEach(function (id) { tasks.push(deleteBook(id)) })
        readDeletedIdSet(LibraryAuth.DELETED_REQUESTS_KEY).forEach(function (id) { tasks.push(deleteRequest(id)) })
        readDeletedIdSet(LibraryAuth.DELETED_PW_RESET_KEY).forEach(function (id) { tasks.push(deletePwReset(id)) })
        await Promise.all(tasks)
      } catch (e) { console.warn('[Firebase] flushDeletedDocs error:', e) }
    }

    async function pullBooks() {
      try {
        var snap = await getDocs(collection(db, 'books'))
        if (snap.empty) return
        var deletedIds = readDeletedIdSet(LibraryAuth.DELETED_BOOKS_KEY)
        var remoteBooks = []
        snap.forEach(function (d) {
          if (!deletedIds.has(String(d.id))) remoteBooks.push(stripInternalFields(d.data()))
        })
        var localBooks = LibraryAuth.loadBooks()
        var localMap   = new Map(localBooks.map(function (b) { return [String(b.id), b] }))
        var changed    = false
        remoteBooks.forEach(function (rb) {
          if (!rb || !rb.id) return
          var key   = String(rb.id)
          var local = localMap.get(key)
          if (!local) {
            // Book exists in Firestore but not locally — add it
            localMap.set(key, rb); changed = true
          }
          // If book exists locally, keep local copy — it is authoritative.
          // The admin edits books on this device; remote is only used to add missing books.
        })
        if (changed) {
          localStorage.setItem(LibraryAuth.BOOKS_KEY, JSON.stringify(Array.from(localMap.values())))
          window.dispatchEvent(new CustomEvent('libraryBooksUpdated'))
        }
      } catch (e) { console.warn('[Firebase] pullBooks error:', e) }
    }

    // ── PULL REQUESTS ───────────────────────────────────────────────────────
    async function pullRequests() {
      try {
        var snap = await getDocs(collection(db, 'borrowRequests'))
        if (snap.empty) return
        var deletedIds = readDeletedIdSet(LibraryAuth.DELETED_REQUESTS_KEY)
        var remoteReqs = []
        snap.forEach(function (d) {
          if (!deletedIds.has(String(d.id))) remoteReqs.push(stripInternalFields(d.data()))
        })
        var localReqs = LibraryAuth.loadRequests()
        var localMap  = new Map(localReqs.map(function (r) { return [String(r.id), r] }))
        var changed   = false
        remoteReqs.forEach(function (rr) {
          if (!rr || !rr.id) return
          var key   = String(rr.id)
          var local = localMap.get(key)
          if (!local) {
            // New request from another device
            localMap.set(key, rr); changed = true
          } else {
            // Remote wins if:
            // 1. Remote status is not pending and local is still pending (admin acted)
            // 2. Remote has a newer reviewedAt timestamp
            // 3. Remote has returnedAt set but local doesn't
            var remoteActed  = rr.status !== 'pending' && local.status === 'pending'
            var remoteNewer  = rr.reviewedAt && local.reviewedAt &&
                               new Date(rr.reviewedAt).getTime() > new Date(local.reviewedAt).getTime()
            var remoteReturn = rr.returnedAt && !local.returnedAt
            if (remoteActed || remoteNewer || remoteReturn) {
              localMap.set(key, rr); changed = true
            }
          }
        })
        if (changed) {
          localStorage.setItem(LibraryAuth.REQUESTS_KEY, JSON.stringify(Array.from(localMap.values())))
          window.dispatchEvent(new CustomEvent('libraryRequestsUpdated'))
        }
      } catch (e) { console.warn('[Firebase] pullRequests error:', e) }
    }

    async function pullPwResets() {
      try {
        var snap = await getDocs(collection(db, 'pwResetRequests'))
        if (snap.empty) return
        var deletedIds = readDeletedIdSet(LibraryAuth.DELETED_PW_RESET_KEY)
        var remoteResets = []
        snap.forEach(function (d) {
          if (!deletedIds.has(String(d.id))) remoteResets.push(stripInternalFields(d.data()))
        })
        var localResets = LibraryAuth.loadPwResets ? LibraryAuth.loadPwResets() : []
        var localMap = new Map(localResets.map(function (r) { return [String(r.id), r] }))
        var changed = false
        remoteResets.forEach(function (rr) {
          if (!rr || !rr.id) return
          var key = String(rr.id)
          var local = localMap.get(key)
          if (!local) {
            localMap.set(key, rr); changed = true
          } else if (rr.status !== local.status) {
            localMap.set(key, rr); changed = true
          } else if (rr.resolvedAt && local.resolvedAt) {
            var rt = new Date(rr.resolvedAt).getTime()
            var lt = new Date(local.resolvedAt).getTime()
            if (!isNaN(rt) && !isNaN(lt) && rt > lt) { localMap.set(key, rr); changed = true }
          }
        })
        if (changed) {
          localStorage.setItem(LibraryAuth.PW_RESET_KEY, JSON.stringify(Array.from(localMap.values())))
          window.dispatchEvent(new CustomEvent('libraryPwResetsUpdated'))
        }
      } catch (e) { console.warn('[Firebase] pullPwResets error:', e) }
    }

    // ── PULL USERS — detect deleted accounts ────────────────────────────────
    // If a user was deleted from Firestore by the admin on another device,
    // remove them from localStorage so they don't come back
    async function pullUsers() {
      try {
        var snap = await getDocs(collection(db, 'users'))
        var remoteIds = new Set()
        var remoteUsers = []
        snap.forEach(function (d) {
          remoteIds.add(d.id)
          var data = stripInternalFields(d.data())
          data.id = data.id || d.id
          remoteUsers.push(data)
        })
        var localUsers   = LibraryAuth.loadUsers()
        var admins       = localUsers.filter(function (u) { return u.role !== 'student' })
        var localMap     = new Map(localUsers.filter(function (u) { return u.role === 'student' }).map(function (u) { return [String(u.id), u] }))
        var changed      = false
        remoteUsers.forEach(function (ru) {
          if (!ru || !ru.id || ru.role === 'admin') return
          var key = String(ru.id)
          var local = localMap.get(key)
          if (!local) {
            localMap.set(key, ru)
            changed = true
          } else {
            Object.keys(ru).forEach(function (k) {
              if (k === 'id' || k === 'role') return
              if (ru[k] !== undefined && ru[k] !== null && String(ru[k]).trim() !== '' && local[k] !== ru[k]) {
                local[k] = ru[k]
                changed = true
              }
            })
          }
        })
        var students = Array.from(localMap.values())
        // Guard: if Firestore is empty, never wipe local students
        if (remoteIds.size === 0) return

        // Only remove a student if:
        //  1. They exist in Firestore at all (remoteIds.size > 0 means we got a real snapshot)
        //  2. Their ID is NOT in Firestore — meaning admin explicitly deleted them
        //  3. They are NOT brand-new (createdAt within last 30 seconds) — give debounce time to sync
        var nowMs = Date.now()
        var kept    = students.filter(function (u) {
          if (remoteIds.has(String(u.id))) return true  // still in Firestore, keep
          // Check if this is a very recently registered student not yet synced
          var age = u.createdAt ? (nowMs - new Date(u.createdAt).getTime()) : Infinity
          if (age < 30000) return true  // less than 30 s old — keep, sync pending
          return false  // absent from Firestore and old enough — admin deleted, remove
        })
        var removed = students.length - kept.length
        if (removed > 0 || changed) {
          var merged = admins.concat(kept)
          localStorage.setItem(LibraryAuth.USERS_KEY, JSON.stringify(merged))
          if (removed > 0) console.log('[Firebase] pullUsers: removed', removed, 'deleted accounts from localStorage')
          window.dispatchEvent(new CustomEvent('libraryUsersUpdated'))
        }
      } catch (e) { console.warn('[Firebase] pullUsers error:', e) }
    }

    // ── SYNC ALL ─────────────────────────────────────────────────────────────
    async function syncAll() {
      try {
        var books    = LibraryAuth.loadBooks()
        var requests = LibraryAuth.loadRequests()
        var users    = LibraryAuth.loadUsers ? LibraryAuth.loadUsers() : []
        var resets   = LibraryAuth.loadPwResets ? LibraryAuth.loadPwResets() : []
        await Promise.all([syncBooksRaw(books), syncRequestsRaw(requests), syncUsersRaw(users), syncPwResetsRaw(resets)])
      } catch (e) { console.warn('[Firebase] syncAll error:', e) }
    }

    // ── PERIODIC RE-SYNC every 5 minutes ─────────────────────────────────────
    var periodicSyncInterval = null
    function startPeriodicSync() {
      if (periodicSyncInterval) clearInterval(periodicSyncInterval)
      periodicSyncInterval = setInterval(async function () {
        if (!navigator.onLine) return
        try {
          await Promise.all([pullBooks(), pullRequests(), pullUsers(), pullPwResets()])
        } catch (e) { console.warn('[Firebase] Periodic sync error:', e) }
      }, 5 * 60 * 1000)
    }

    // ── ONLINE / OFFLINE ──────────────────────────────────────────────────────
    window.addEventListener('online', async function () {
      updateFirebaseStatus('connecting')
      try {
        await Promise.all([pullBooks(), pullRequests(), pullUsers(), pullPwResets()])
        await syncAll()
        updateFirebaseStatus('synced')
      } catch (e) { updateFirebaseStatus('error') }
    })
    window.addEventListener('offline', function () { updateFirebaseStatus('offline') })

    // ── INITIAL LOAD ──────────────────────────────────────────────────────────
    await flushDeletedDocs()
    await Promise.all([pullBooks(), pullRequests(), pullUsers(), pullPwResets()])
    await syncAll()
    updateFirebaseStatus('synced')

    // ── REAL-TIME LISTENERS ───────────────────────────────────────────────────
    onSnapshot(collection(db, 'books'), function (snap) {
      if (!snap.metadata.hasPendingWrites) pullBooks()
    })
    onSnapshot(collection(db, 'borrowRequests'), function (snap) {
      if (!snap.metadata.hasPendingWrites) pullRequests()
    })
    onSnapshot(collection(db, 'pwResetRequests'), function (snap) {
      if (!snap.metadata.hasPendingWrites) pullPwResets()
    })
    onSnapshot(collection(db, 'users'), function (snap) {
      if (!snap.metadata.hasPendingWrites) pullUsers()
    })

    startPeriodicSync()

    window.LibraryFirebase = {
      syncBooks, syncRequests, syncRequestsNow, syncUsers, syncUsersNow, syncPwResets, syncAll,
      pullBooks, pullRequests, pullUsers, pullPwResets,
      deleteUser, deleteRequest, deleteBook, deletePwReset,
      db
    }
    window.dispatchEvent(new CustomEvent('libraryFirebaseReady'))

    console.log('[Firebase] Ready \u2713')

  } catch (err) {
    console.warn('[Firebase] Failed to initialize:', err)
    updateFirebaseStatus('offline')
    window.LibraryFirebase = null
  }
})()