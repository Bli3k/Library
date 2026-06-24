// firebase-sync.js — Background Firebase Firestore sync for BCST Library System
// CHANGES FROM PREVIOUS VERSION:
//   1. Added CLIENT_TOKEN to every write so Firestore security rules can validate writes
//   2. Fixed writeBatch() 500-document limit — large book lists are now chunked
//   3. pullBooks() now also merges existing local fields instead of only adding new docs
//   4. pullRequests() conflict resolution improved: any newer reviewedAt wins, not just remote
//   5. Added periodic re-sync every 5 minutes (catches changes made on other devices)
//   6. Added syncAll() — pushes books + requests + users in one call (used on page load)
//   7. updateFirebaseStatus() moved to top so it is available even before try/catch
//   8. App-check / duplicate-init guard so loading the script twice does not throw
//   9. _clientToken field stripped from data before saving back to localStorage

(async function () {

  // ── Guard: prevent double-initialisation if script is loaded twice ──────────
  if (window.__libraryFirebaseInit) return
  window.__libraryFirebaseInit = true

  // ── Shared secret written into every Firestore document on write ────────────
  // Must match the token used in your Firestore security rules:
  //   function hasValidToken() {
  //     return request.resource.data._clientToken == "bcst-library-2025";
  //   }
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

  // ── Status helper defined FIRST so it works even if init fails ──────────────
  function updateFirebaseStatus(state) {
    try {
      const el = document.getElementById('firebase-status')
      if (!el) return
      const states = {
        connecting: { text: '\u27f3 Syncing\u2026',     cls: 'fb-connecting' },
        synced:     { text: '\u2601 Cloud Synced',  cls: 'fb-synced'     },
        error:      { text: '\u26a0 Sync Error',    cls: 'fb-error'      },
        offline:    { text: '\u2298 Cloud Offline', cls: 'fb-offline'    }
      }
      const s = states[state] || states.connecting
      el.textContent = s.text
      el.className   = 'firebase-status ' + s.cls
    } catch (e) {}
  }

  updateFirebaseStatus('connecting')

  // ── Helpers ─────────────────────────────────────────────────────────────────

  // Debounce: delays rapid successive calls (e.g. importing 500 books at once)
  function debounce(fn, ms) {
    let t
    return function (...args) { clearTimeout(t); t = setTimeout(function () { fn.apply(this, args) }, ms) }
  }

  // Strip undefined values — Firestore rejects them
  function sanitize(obj) {
    if (Array.isArray(obj)) return obj.map(sanitize)
    if (obj && typeof obj === 'object') {
      const out = {}
      for (const k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined) {
          out[k] = sanitize(obj[k])
        }
      }
      return out
    }
    return obj === undefined ? null : obj
  }

  // Strip internal Firestore-only fields before saving back to localStorage
  function stripInternalFields(obj) {
    if (!obj || typeof obj !== 'object') return obj
    const clean = Object.assign({}, obj)
    delete clean._clientToken
    delete clean._updatedAt
    return clean
  }

  // Firestore writeBatch is limited to 500 operations per commit.
  // This splits any array into chunks and commits each batch separately.
  async function commitInChunks(db, items, writeBatchFn, buildBatchFn, chunkSize) {
    chunkSize = chunkSize || 400
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize)
      const batch = writeBatchFn(db)
      chunk.forEach(function (item) { buildBatchFn(batch, item) })
      await batch.commit()
    }
  }

  // ── Main init ────────────────────────────────────────────────────────────────
  try {
    const firebaseAppModule = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js')
    const initializeApp = firebaseAppModule.initializeApp
    const getApps       = firebaseAppModule.getApps

    const firestoreModule = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js')
    const getFirestore    = firestoreModule.getFirestore
    const collection      = firestoreModule.collection
    const doc             = firestoreModule.doc
    const getDocs         = firestoreModule.getDocs
    const writeBatch      = firestoreModule.writeBatch
    const serverTimestamp = firestoreModule.serverTimestamp

    // Re-use existing Firebase app if already initialised (e.g. script loaded twice)
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
    const db  = getFirestore(app)

    // ── SYNC BOOKS ────────────────────────────────────────────────────────────
    // Writes every book to Firestore with _clientToken so rules allow the write.
    var syncBooksRaw = async function (books) {
      if (!Array.isArray(books) || books.length === 0) return
      try {
        const validBooks = books.filter(function (b) { return b && b.id })
        await commitInChunks(db, validBooks, writeBatch, function (batch, b) {
          const ref  = doc(collection(db, 'books'), String(b.id))
          const data = Object.assign(sanitize(b), {
            _clientToken: CLIENT_TOKEN,    // required by Firestore security rules
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
    const syncBooks = debounce(syncBooksRaw, 1200)

    // ── SYNC BORROW REQUESTS ──────────────────────────────────────────────────
    var syncRequestsRaw = async function (requests) {
      if (!Array.isArray(requests) || requests.length === 0) return
      try {
        const validReqs = requests.filter(function (r) { return r && r.id })
        await commitInChunks(db, validReqs, writeBatch, function (batch, r) {
          const ref  = doc(collection(db, 'borrowRequests'), String(r.id))
          const data = Object.assign(sanitize(r), {
            _clientToken: CLIENT_TOKEN,    // required by Firestore security rules
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
    const syncRequests = debounce(syncRequestsRaw, 1200)

    // ── SYNC USERS (non-sensitive fields only) ────────────────────────────────
    // Passwords and admin accounts are NEVER sent to Firestore.
    var syncUsersRaw = async function (users) {
      if (!Array.isArray(users)) return
      try {
        const safeUsers = users
          .filter(function (u) { return u && u.id && u.role !== 'admin' })
          .map(function (u) {
            return {
              id:            u.id,
              name:          u.name          || '',
              role:          u.role          || 'student',
              email:         u.email         || '',
              courseStrand:  u.courseStrand  || '',
              year:          u.year          || '',
              section:       u.section       || '',
              contactNumber: u.contactNumber || '',
              createdAt:     u.createdAt     || '',
              _clientToken:  CLIENT_TOKEN,   // required by Firestore security rules
              _updatedAt:    serverTimestamp()
            }
          })
        if (safeUsers.length === 0) return
        await commitInChunks(db, safeUsers, writeBatch, function (batch, u) {
          const ref = doc(collection(db, 'users'), String(u.id))
          batch.set(ref, sanitize(u), { merge: true })
        })
      } catch (e) {
        console.warn('[Firebase] syncUsers error:', e)
      }
    }
    const syncUsers = debounce(syncUsersRaw, 2000)

    // ── PULL BOOKS from Firestore → merge into localStorage ───────────────────
    // CHANGE: Now merges field-by-field on existing docs (not just add-new-only).
    // _clientToken and _updatedAt are stripped before storing locally.
    async function pullBooks() {
      try {
        const snap = await getDocs(collection(db, 'books'))
        if (snap.empty) return

        const remoteBooks = []
        snap.forEach(function (d) { remoteBooks.push(stripInternalFields(d.data())) })

        const localBooks = LibraryAuth.loadBooks()
        const localMap   = new Map(localBooks.map(function (b) { return [String(b.id), b] }))
        let changed = false

        remoteBooks.forEach(function (rb) {
          if (!rb || !rb.id) return
          const key   = String(rb.id)
          const local = localMap.get(key)

          if (!local) {
            // Brand-new book from another device — add it
            localMap.set(key, rb)
            changed = true
          } else {
            // Book exists locally — fill in any fields that are empty locally
            // but have a value remotely (remote fills gaps, never overwrites)
            Object.keys(rb).forEach(function (k) {
              const remoteVal = rb[k]
              const localVal  = local[k]
              if (
                remoteVal !== undefined && remoteVal !== null &&
                String(remoteVal).trim() !== '' &&
                (localVal === undefined || localVal === null || String(localVal).trim() === '')
              ) {
                local[k] = remoteVal
                changed   = true
              }
            })
          }
        })

        if (changed) {
          const merged = Array.from(localMap.values())
          localStorage.setItem(LibraryAuth.BOOKS_KEY, JSON.stringify(merged))
          console.log('[Firebase] pullBooks: merged', remoteBooks.length, 'remote books into localStorage')
          window.dispatchEvent(new CustomEvent('libraryBooksUpdated'))
        }
      } catch (e) {
        console.warn('[Firebase] pullBooks error:', e)
      }
    }

    // ── PULL BORROW REQUESTS from Firestore → merge into localStorage ─────────
    // CHANGE: Conflict resolution now uses proper timestamp comparison.
    //   • Local doesn't have it  → add remote
    //   • Remote is reviewed, local is still pending → remote wins (admin acted elsewhere)
    //   • Both reviewed → keep whichever reviewedAt is more recent
    async function pullRequests() {
      try {
        const snap = await getDocs(collection(db, 'borrowRequests'))
        if (snap.empty) return

        const remoteReqs = []
        snap.forEach(function (d) { remoteReqs.push(stripInternalFields(d.data())) })

        const localReqs = LibraryAuth.loadRequests()
        const localMap  = new Map(localReqs.map(function (r) { return [String(r.id), r] }))
        let changed = false

        remoteReqs.forEach(function (rr) {
          if (!rr || !rr.id) return
          const key   = String(rr.id)
          const local = localMap.get(key)

          if (!local) {
            // New request that arrived on another device
            localMap.set(key, rr)
            changed = true
          } else if (rr.status !== 'pending' && local.status === 'pending') {
            // Admin approved/rejected on another device — remote wins
            localMap.set(key, rr)
            changed = true
          } else if (rr.reviewedAt && local.reviewedAt) {
            // Both reviewed — keep the more recent review
            const remoteTime = new Date(rr.reviewedAt).getTime()
            const localTime  = new Date(local.reviewedAt).getTime()
            if (!isNaN(remoteTime) && !isNaN(localTime) && remoteTime > localTime) {
              localMap.set(key, rr)
              changed = true
            }
          }
        })

        if (changed) {
          const merged = Array.from(localMap.values())
          localStorage.setItem(LibraryAuth.REQUESTS_KEY, JSON.stringify(merged))
          console.log('[Firebase] pullRequests: merged', remoteReqs.length, 'remote requests into localStorage')
          window.dispatchEvent(new CustomEvent('libraryRequestsUpdated'))
        }
      } catch (e) {
        console.warn('[Firebase] pullRequests error:', e)
      }
    }

    // ── SYNC ALL — push current localStorage state up to Firestore ───────────
    // Called once on page load so Firestore is always in sync with localStorage.
    async function syncAll() {
      try {
        const books    = LibraryAuth.loadBooks()
        const requests = LibraryAuth.loadRequests()
        const users    = LibraryAuth.loadUsers ? LibraryAuth.loadUsers() : []
        await Promise.all([
          syncBooksRaw(books),
          syncRequestsRaw(requests),
          syncUsersRaw(users)
        ])
      } catch (e) {
        console.warn('[Firebase] syncAll error:', e)
      }
    }

    // ── PERIODIC RE-SYNC every 5 minutes ─────────────────────────────────────
    // Catches changes made on other devices without requiring a page reload.
    // Example: admin approves a borrow on desktop → student tab on phone sees it in ~5 min.
    var periodicSyncInterval = null
    function startPeriodicSync() {
      if (periodicSyncInterval) clearInterval(periodicSyncInterval)
      periodicSyncInterval = setInterval(async function () {
        if (!navigator.onLine) return
        try {
          await Promise.all([pullBooks(), pullRequests()])
          console.log('[Firebase] Periodic re-sync complete')
        } catch (e) {
          console.warn('[Firebase] Periodic re-sync error:', e)
        }
      }, 5 * 60 * 1000) // every 5 minutes
    }

    // ── ONLINE / OFFLINE handling ─────────────────────────────────────────────
    window.addEventListener('online', async function () {
      console.log('[Firebase] Back online — re-syncing…')
      updateFirebaseStatus('connecting')
      try {
        await Promise.all([pullBooks(), pullRequests()])
        await syncAll()
        updateFirebaseStatus('synced')
      } catch (e) {
        updateFirebaseStatus('error')
      }
    })

    window.addEventListener('offline', function () {
      updateFirebaseStatus('offline')
    })

    // ── INITIAL LOAD: pull first, then push ──────────────────────────────────
    // Pull first so any remote approvals/rejections are reflected locally
    // before we push (avoids overwriting a remote approval with a stale local pending).
    await Promise.all([pullBooks(), pullRequests()])
    await syncAll()
    updateFirebaseStatus('synced')
    startPeriodicSync()

    // Expose API so auth.js, admin.js, student.js can trigger syncs on demand
    window.LibraryFirebase = {
      syncBooks,
      syncRequests,
      syncUsers,
      syncAll,
      pullBooks,
      pullRequests,
      db
    }

    console.log('[Firebase] Initialized and ready \u2713')

  } catch (err) {
    console.warn('[Firebase] Failed to initialize:', err)
    updateFirebaseStatus('offline')
    // App still works fully offline via localStorage — Firebase is optional
    window.LibraryFirebase = null
  }

})()