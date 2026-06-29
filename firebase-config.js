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

    // ── SYNC USERS (no passwords, no admin) ─────────────────────────────────
    var syncUsersRaw = async function (users) {
      if (!Array.isArray(users)) return
      try {
        var safe = users
          .filter(function (u) { return u && u.id && u.role !== 'admin' })
          .map(function (u) {
            return {
              id: u.id, name: u.name || '', role: u.role || 'student',
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

    // ── PULL BOOKS ──────────────────────────────────────────────────────────
    async function pullBooks() {
      try {
        var snap = await getDocs(collection(db, 'books'))
        if (snap.empty) return
        var remoteBooks = []
        snap.forEach(function (d) { remoteBooks.push(stripInternalFields(d.data())) })
        var localBooks = LibraryAuth.loadBooks()
        var localMap   = new Map(localBooks.map(function (b) { return [String(b.id), b] }))
        var changed    = false
        remoteBooks.forEach(function (rb) {
          if (!rb || !rb.id) return
          var key   = String(rb.id)
          var local = localMap.get(key)
          if (!local) {
            localMap.set(key, rb); changed = true
          } else {
            Object.keys(rb).forEach(function (k) {
              var rv = rb[k], lv = local[k]
              if (rv !== undefined && rv !== null && String(rv).trim() !== '' &&
                  (lv === undefined || lv === null || String(lv).trim() === '')) {
                local[k] = rv; changed = true
              }
            })
          }
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
        var remoteReqs = []
        snap.forEach(function (d) { remoteReqs.push(stripInternalFields(d.data())) })
        var localReqs = LibraryAuth.loadRequests()
        var localMap  = new Map(localReqs.map(function (r) { return [String(r.id), r] }))
        var changed   = false
        remoteReqs.forEach(function (rr) {
          if (!rr || !rr.id) return
          var key   = String(rr.id)
          var local = localMap.get(key)
          if (!local) {
            localMap.set(key, rr); changed = true
          } else if (rr.status !== 'pending' && local.status === 'pending') {
            localMap.set(key, rr); changed = true
          } else if (rr.reviewedAt && local.reviewedAt) {
            var rt = new Date(rr.reviewedAt).getTime()
            var lt = new Date(local.reviewedAt).getTime()
            if (!isNaN(rt) && !isNaN(lt) && rt > lt) { localMap.set(key, rr); changed = true }
          }
        })
        if (changed) {
          localStorage.setItem(LibraryAuth.REQUESTS_KEY, JSON.stringify(Array.from(localMap.values())))
          window.dispatchEvent(new CustomEvent('libraryRequestsUpdated'))
        }
      } catch (e) { console.warn('[Firebase] pullRequests error:', e) }
    }

    // ── PULL USERS — detect deleted accounts ────────────────────────────────
    // If a user was deleted from Firestore by the admin on another device,
    // remove them from localStorage so they don't come back
    async function pullUsers() {
      try {
        var snap = await getDocs(collection(db, 'users'))
        var remoteIds = new Set()
        snap.forEach(function (d) { remoteIds.add(d.id) })
        var localUsers   = LibraryAuth.loadUsers()
        var students     = localUsers.filter(function (u) { return u.role === 'student' })
        var admins       = localUsers.filter(function (u) { return u.role !== 'student' })
        // Only keep students that still exist in Firestore
        // (if Firestore is empty, skip — avoids wiping on first load)
        if (remoteIds.size === 0) return
        var kept    = students.filter(function (u) { return remoteIds.has(String(u.id)) })
        var removed = students.length - kept.length
        if (removed > 0) {
          var merged = admins.concat(kept)
          localStorage.setItem(LibraryAuth.USERS_KEY, JSON.stringify(merged))
          console.log('[Firebase] pullUsers: removed', removed, 'deleted accounts from localStorage')
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
        await Promise.all([syncBooksRaw(books), syncRequestsRaw(requests), syncUsersRaw(users)])
      } catch (e) { console.warn('[Firebase] syncAll error:', e) }
    }

    // ── PERIODIC RE-SYNC every 5 minutes ─────────────────────────────────────
    var periodicSyncInterval = null
    function startPeriodicSync() {
      if (periodicSyncInterval) clearInterval(periodicSyncInterval)
      periodicSyncInterval = setInterval(async function () {
        if (!navigator.onLine) return
        try {
          await Promise.all([pullBooks(), pullRequests(), pullUsers()])
        } catch (e) { console.warn('[Firebase] Periodic sync error:', e) }
      }, 5 * 60 * 1000)
    }

    // ── ONLINE / OFFLINE ──────────────────────────────────────────────────────
    window.addEventListener('online', async function () {
      updateFirebaseStatus('connecting')
      try {
        await Promise.all([pullBooks(), pullRequests(), pullUsers()])
        await syncAll()
        updateFirebaseStatus('synced')
      } catch (e) { updateFirebaseStatus('error') }
    })
    window.addEventListener('offline', function () { updateFirebaseStatus('offline') })

    // ── INITIAL LOAD ──────────────────────────────────────────────────────────
    await Promise.all([pullBooks(), pullRequests(), pullUsers()])
    await syncAll()
    updateFirebaseStatus('synced')

    // ── REAL-TIME LISTENERS ───────────────────────────────────────────────────
    onSnapshot(collection(db, 'books'), function (snap) {
      if (!snap.metadata.hasPendingWrites) pullBooks()
    })
    onSnapshot(collection(db, 'borrowRequests'), function (snap) {
      if (!snap.metadata.hasPendingWrites) pullRequests()
    })
    onSnapshot(collection(db, 'users'), function (snap) {
      if (!snap.metadata.hasPendingWrites) pullUsers()
    })

    startPeriodicSync()

    window.LibraryFirebase = {
      syncBooks, syncRequests, syncUsers, syncAll,
      pullBooks, pullRequests, pullUsers,
      deleteUser, deleteRequest,
      db
    }

    console.log('[Firebase] Ready \u2713')

  } catch (err) {
    console.warn('[Firebase] Failed to initialize:', err)
    updateFirebaseStatus('offline')
    window.LibraryFirebase = null
  }
})()