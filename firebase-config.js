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
    var getDocsFromServer = fbStore.getDocsFromServer || fbStore.getDocs
    var deleteDoc        = fbStore.deleteDoc
    var writeBatch       = fbStore.writeBatch
    var serverTimestamp  = fbStore.serverTimestamp
    var onSnapshot       = fbStore.onSnapshot

    var app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
    var db  = getFirestore(app)

    // ── SYNC BOOKS ──────────────────────────────────────────────────────────
    var _lastSyncedBooksHash = null
    function hashBooks(books) {
      // Lightweight hash: JSON of sorted ids + copies count
      try {
        var sig = books.map(function(b){ return b.id + ':' + (b.copies||0) }).sort().join('|')
        return sig
      } catch(e) { return '' }
    }
    var syncBooksRaw = async function (books, force) {
      if (!Array.isArray(books) || books.length === 0) return
      var hash = hashBooks(books)
      if (!force && hash && hash === _lastSyncedBooksHash) {
        console.log('[Firebase] syncBooks: no change, skipping push')
        return
      }
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
        _lastSyncedBooksHash = hash
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
    // Non-debounced version — used by forgot-password.js so request reaches Firestore immediately
    var syncPwResetsNow = syncPwResetsRaw

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

    // Detect which page we're on — student page is NOT authoritative for books
    var IS_ADMIN_PAGE = (
      window.location.pathname.endsWith('admin.html') ||
      window.location.href.indexOf('admin.html') !== -1
    )

    function applyRemoteBooks(remoteBooks) {
      var localBooks = LibraryAuth.loadBooks()

      if (!IS_ADMIN_PAGE) {
        // ── STUDENT / READ-ONLY SIDE ────────────────────────────────────────
        // Firestore is the single source of truth for books on the student side.
        // Replace localStorage entirely with whatever Firestore has.
        // This ensures deletes, edits, and re-imports from admin always show up.
        if (remoteBooks.length === 0) return  // empty snap — don't wipe, wait for real data
        var localJSON  = JSON.stringify(localBooks.slice().sort(function(a,b){ return String(a.id).localeCompare(String(b.id)) }))
        var remoteJSON = JSON.stringify(remoteBooks.slice().sort(function(a,b){ return String(a.id).localeCompare(String(b.id)) }))
        if (localJSON === remoteJSON) return  // identical — nothing to do
        localStorage.setItem(LibraryAuth.BOOKS_KEY, JSON.stringify(remoteBooks))
        window.dispatchEvent(new CustomEvent('libraryBooksUpdated'))
        return
      }

      // ── ADMIN SIDE ──────────────────────────────────────────────────────
      // Local is authoritative on admin — only pull books that don't exist locally.
      // Admin edits/deletes/imports are the source of truth; remote only fills gaps.
      var deletedIds = readDeletedIdSet(LibraryAuth.DELETED_BOOKS_KEY)
      var localMap   = new Map(localBooks.map(function (b) { return [String(b.id), b] }))
      var changed    = false
      remoteBooks.forEach(function (rb) {
        if (!rb || !rb.id) return
        if (deletedIds.has(String(rb.id))) return  // admin deleted this, skip
        var key = String(rb.id)
        if (!localMap.get(key)) {
          localMap.set(key, rb); changed = true
        }
      })
      if (changed) {
        localStorage.setItem(LibraryAuth.BOOKS_KEY, JSON.stringify(Array.from(localMap.values())))
        window.dispatchEvent(new CustomEvent('libraryBooksUpdated'))
      }
    }
    function pullBooksFromSnap(snap) {
      if (!snap) return
      var remoteBooks = []
      if (!snap.empty) {
        snap.forEach(function (d) { remoteBooks.push(stripInternalFields(d.data())) })
      }
      // Pass empty array on student side so it can clear stale local books
      // (applyRemoteBooks guards against wiping on genuine empty snaps)
      if (!IS_ADMIN_PAGE && remoteBooks.length === 0) {
        // Admin wiped all books — clear student's local list too
        var localBooks = LibraryAuth.loadBooks()
        if (localBooks.length > 0) {
          localStorage.setItem(LibraryAuth.BOOKS_KEY, JSON.stringify([]))
          window.dispatchEvent(new CustomEvent('libraryBooksUpdated'))
        }
        return
      }
      applyRemoteBooks(remoteBooks)
    }
    async function pullBooks() {
      try {
        var snap = await getDocs(collection(db, 'books'))
        var remoteBooks = []
        if (!snap.empty) {
          snap.forEach(function (d) { remoteBooks.push(stripInternalFields(d.data())) })
        }
        // On student side, empty Firestore means admin cleared all books
        if (!IS_ADMIN_PAGE && remoteBooks.length === 0) {
          var localBooks = LibraryAuth.loadBooks()
          if (localBooks.length > 0) {
            localStorage.setItem(LibraryAuth.BOOKS_KEY, JSON.stringify([]))
            window.dispatchEvent(new CustomEvent('libraryBooksUpdated'))
          }
          return
        }
        applyRemoteBooks(remoteBooks)
      } catch (e) { console.warn('[Firebase] pullBooks error:', e) }
    }

    // ── PULL REQUESTS ───────────────────────────────────────────────────────
    function applyRemoteRequests(remoteReqs) {
      var deletedIds = readDeletedIdSet(LibraryAuth.DELETED_REQUESTS_KEY)
      var localReqs = LibraryAuth.loadRequests()
      var localMap  = new Map(localReqs.map(function (r) { return [String(r.id), r] }))
      var changed   = false
      remoteReqs.forEach(function (rr) {
        if (!rr || !rr.id) return
        if (deletedIds.has(String(rr.id))) return
        var key   = String(rr.id)
        var local = localMap.get(key)
        if (!local) {
          localMap.set(key, rr); changed = true
        } else {
          var remoteActed   = rr.status !== 'pending' && local.status === 'pending'
          var remoteNewer   = rr.reviewedAt && local.reviewedAt &&
                              new Date(rr.reviewedAt).getTime() > new Date(local.reviewedAt).getTime()
          // Accept remote returnedAt in all cases where remote has it and local doesn't match
          var remoteReturn  = rr.returnedAt && (rr.returnedAt !== local.returnedAt)
          // Also accept if remote cleared returnedAt (e.g. admin un-returned — rare but safe)
          var remoteUnreturn = !rr.returnedAt && local.returnedAt && rr.status === local.status
          // Accept a new/changed "Notify" reminder from the admin even when
          // status/reviewedAt/returnedAt are unchanged — otherwise the
          // reminder banner never reaches the student's device.
          var remoteNotified = rr.returnNotifiedAt && rr.returnNotifiedAt !== local.returnNotifiedAt
          if (remoteActed || remoteNewer || remoteReturn || remoteUnreturn || remoteNotified) {
            localMap.set(key, rr); changed = true
          }
        }
      })
      if (changed) {
        localStorage.setItem(LibraryAuth.REQUESTS_KEY, JSON.stringify(Array.from(localMap.values())))
        window.dispatchEvent(new CustomEvent('libraryRequestsUpdated'))
      }
    }
    function pullRequestsFromSnap(snap) {
      if (!snap || snap.empty) return
      var remoteReqs = []
      snap.forEach(function (d) { remoteReqs.push(stripInternalFields(d.data())) })
      applyRemoteRequests(remoteReqs)
    }
    async function pullRequests() {
      try {
        var snap = await getDocs(collection(db, 'borrowRequests'))
        if (snap.empty) return
        var remoteReqs = []
        snap.forEach(function (d) { remoteReqs.push(stripInternalFields(d.data())) })
        applyRemoteRequests(remoteReqs)
      } catch (e) { console.warn('[Firebase] pullRequests error:', e) }
    }

    function applyRemotePwResets(remoteResets) {
      var deletedIds = readDeletedIdSet(LibraryAuth.DELETED_PW_RESET_KEY)
      var localResets = LibraryAuth.loadPwResets ? LibraryAuth.loadPwResets() : []
      var localMap = new Map(localResets.map(function (r) { return [String(r.id), r] }))
      var changed = false
      remoteResets.forEach(function (rr) {
        if (!rr || !rr.id) return
        if (deletedIds.has(String(rr.id))) return
        var key = String(rr.id)
        var local = localMap.get(key)
        if (!local) {
          // New reset request not seen locally — always add it
          localMap.set(key, rr); changed = true
        } else if (rr.status !== local.status) {
          localMap.set(key, rr); changed = true
        } else if (rr.resolvedAt && !local.resolvedAt) {
          localMap.set(key, rr); changed = true
        }
      })
      if (changed) {
        localStorage.setItem(LibraryAuth.PW_RESET_KEY, JSON.stringify(Array.from(localMap.values())))
        window.dispatchEvent(new CustomEvent('libraryPwResetsUpdated'))
      }
    }
    function pullPwResetsFromSnap(snap) {
      if (!snap || snap.empty) return
      var remoteResets = []
      snap.forEach(function (d) { remoteResets.push(stripInternalFields(d.data())) })
      applyRemotePwResets(remoteResets)
    }
    async function pullPwResets() {
      try {
        // Use getDocsFromServer to bypass Firestore's local cache so we always
        // get the freshest reset requests (avoids admin seeing stale empty list)
        var getFromServer = fbStore.getDocsFromServer || getDocs
        var snap = await getFromServer(collection(db, 'pwResetRequests'))
        // Don't return early on empty — we still need to dispatch the update
        // so the UI clears any stale entries
        var remoteResets = []
        snap.forEach(function (d) { remoteResets.push(stripInternalFields(d.data())) })
        applyRemotePwResets(remoteResets)
        // Always fire the update event so the UI re-renders
        window.dispatchEvent(new CustomEvent('libraryPwResetsUpdated'))
      } catch (e) { console.warn('[Firebase] pullPwResets error:', e) }
    }

    // ── PULL USERS ────────────────────────────────────────────────────────────
    function applyRemoteUsers(snap) {
      var remoteIds = new Set()
      var remoteUsers = []
      snap.forEach(function (d) {
        remoteIds.add(d.id)
        var data = stripInternalFields(d.data())
        data.id = data.id || d.id
        remoteUsers.push(data)
      })
      if (remoteIds.size === 0) return  // Firestore empty — never wipe locals
      var localUsers = LibraryAuth.loadUsers()
      var admins     = localUsers.filter(function (u) { return u.role !== 'student' })
      var localMap   = new Map(localUsers.filter(function (u) { return u.role === 'student' }).map(function (u) { return [String(u.id), u] }))
      var changed    = false
      remoteUsers.forEach(function (ru) {
        if (!ru || !ru.id || ru.role === 'admin') return
        var key   = String(ru.id)
        var local = localMap.get(key)
        if (!local) {
          localMap.set(key, ru); changed = true
        } else {
          Object.keys(ru).forEach(function (k) {
            if (k === 'id' || k === 'role') return
            if (ru[k] !== undefined && ru[k] !== null && String(ru[k]).trim() !== '' && local[k] !== ru[k]) {
              local[k] = ru[k]; changed = true
            }
          })
        }
      })
      var nowMs    = Date.now()
      var students = Array.from(localMap.values())
      var kept     = students.filter(function (u) {
        if (remoteIds.has(String(u.id))) return true
        var age = u.createdAt ? (nowMs - new Date(u.createdAt).getTime()) : Infinity
        return age < 30000  // brand-new — keep until debounce sync finishes
      })
      var removed = students.length - kept.length
      if (removed > 0 || changed) {
        localStorage.setItem(LibraryAuth.USERS_KEY, JSON.stringify(admins.concat(kept)))
        window.dispatchEvent(new CustomEvent('libraryUsersUpdated'))
      }
    }
    function pullUsersFromSnap(snap) { if (snap) applyRemoteUsers(snap) }
    async function pullUsers() {
      try {
        var snap = await getDocs(collection(db, 'users'))
        applyRemoteUsers(snap)
      } catch (e) { console.warn('[Firebase] pullUsers error:', e) }
    }

    // ── SYNC ALL ─────────────────────────────────────────────────────────────
    async function syncAll() {
      try {
        // Do NOT re-sync books here — books are only pushed when the admin
        // explicitly imports, adds, or edits them. This prevents duplication
        // and stops the continuous re-sync loop.
        var requests = LibraryAuth.loadRequests()
        var users    = LibraryAuth.loadUsers ? LibraryAuth.loadUsers() : []
        var resets   = LibraryAuth.loadPwResets ? LibraryAuth.loadPwResets() : []
        await Promise.all([syncRequestsRaw(requests), syncUsersRaw(users), syncPwResetsRaw(resets)])
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
        // Pull all collections; syncAll pushes requests/users/resets (not books)
        await Promise.all([pullBooks(), pullRequests(), pullUsers(), pullPwResets()])
        await syncAll()
        updateFirebaseStatus('synced')
      } catch (e) { updateFirebaseStatus('error') }
    })
    window.addEventListener('offline', function () { updateFirebaseStatus('offline') })

    // ── INITIAL LOAD ──────────────────────────────────────────────────────────
    await flushDeletedDocs()
    // Pull books FIRST so book IDs are in localStorage before requests arrive.
    // This fixes the Electron desktop race: requests reference bookIds that
    // don't exist yet if books and requests are fetched in parallel.
    await pullBooks()
    await Promise.all([pullRequests(), pullUsers(), pullPwResets()])
    await syncAll()
    updateFirebaseStatus('synced')

    // ── REAL-TIME LISTENERS ───────────────────────────────────────────────────
    // Use snapshot data directly — avoids getDocs returning stale cache
    onSnapshot(collection(db, 'books'), function (snap) {
      if (snap.metadata.hasPendingWrites) return
      pullBooksFromSnap(snap)
    })
    onSnapshot(collection(db, 'borrowRequests'), function (snap) {
      if (snap.metadata.hasPendingWrites) return
      pullRequestsFromSnap(snap)
    })
    onSnapshot(collection(db, 'pwResetRequests'), function (snap) {
      if (snap.metadata.hasPendingWrites) return
      pullPwResetsFromSnap(snap)
    })
    onSnapshot(collection(db, 'users'), function (snap) {
      if (snap.metadata.hasPendingWrites) return
      pullUsersFromSnap(snap)
    })

    startPeriodicSync()

    window.LibraryFirebase = {
      syncBooks, syncRequests, syncRequestsNow, syncUsers, syncUsersNow, syncPwResets, syncPwResetsNow, syncAll,
      pullBooks, pullRequests, pullUsers, pullPwResets,
      deleteUser, deleteRequest, deleteBook, deletePwReset,
      db
    }
    window.dispatchEvent(new CustomEvent('libraryFirebaseReady'))

    console.log('[Firebase] Ready \u2713')

  } catch (err) {
    console.warn('[Firebase] Failed to initialize:', err)
    updateFirebaseStatus('error')
    window.LibraryFirebase = null
    window.dispatchEvent(new CustomEvent('libraryFirebaseError'))
  }
})()