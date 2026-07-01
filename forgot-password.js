// Forgot password request screen
(function () {
  var form      = document.getElementById('forgot-form')
  var emailInput = document.getElementById('forgot-email')
  var submitBtn  = document.getElementById('forgot-submit')
  var msg        = document.getElementById('forgot-msg')

  if (!form) return

  function showMsg(text, type) {
    if (!msg) return
    msg.textContent = text
    msg.className   = 'request-msg ' + type
  }

  // Wait for Firebase to be a real, usable object — not just the key existing in window.
  // On desktop (Electron), Firebase can fail to init and set window.LibraryFirebase = null;
  // the old check ('LibraryFirebase' in window) wrongly resolved immediately in that case.
  function waitForFirebaseReady(timeoutMs) {
    if (window.LibraryFirebase) return Promise.resolve()
    return new Promise(function (resolve) {
      var done = false
      function finish() {
        if (done) return
        done = true
        resolve()
      }
      var timer = setTimeout(finish, timeoutMs || 6000)
      // Firebase loaded successfully
      window.addEventListener('libraryFirebaseReady', function () {
        clearTimeout(timer); finish()
      }, { once: true })
      // Firebase failed to load — resolve early so we don't hang the full timeout
      window.addEventListener('libraryFirebaseError', function () {
        clearTimeout(timer); finish()
      }, { once: true })
    })
  }

  form.addEventListener('submit', async function (evt) {
    evt.preventDefault()
    var email = (emailInput.value || '').trim()
    if (!email) {
      showMsg('Please enter your registered email address.', 'error')
      return
    }

    if (submitBtn) submitBtn.disabled = true
    showMsg('Connecting to server…', 'success')

    try {
      // Wait for Firebase — on desktop this can take 1–3 seconds
      await waitForFirebaseReady(6000)

      if (!window.LibraryFirebase) {
        // Firebase unavailable (no network or init failed)
        showMsg('Cannot connect to the server. Please check your internet connection and try again.', 'error')
        return
      }

      showMsg('Checking your account…', 'success')

      // Pull fresh user list — critical on desktop when the student registered on
      // another device and their account is not yet in this machine's local storage.
      try { await window.LibraryFirebase.pullUsers() } catch (e) {}

      // Pull existing reset requests to prevent duplicate submissions
      try { await window.LibraryFirebase.pullPwResets() } catch (e) {}

      var result = LibraryAuth.createPasswordResetRequest(email, '')
      if (!result.ok) {
        showMsg(result.error, 'error')
        return
      }

      showMsg('Sending request to admin…', 'success')

      // Push immediately (non-debounced) so admin sees the request right away
      try {
        if (window.LibraryFirebase.syncPwResetsNow) {
          await window.LibraryFirebase.syncPwResetsNow(LibraryAuth.loadPwResets())
        } else if (window.LibraryFirebase.syncPwResets) {
          window.LibraryFirebase.syncPwResets(LibraryAuth.loadPwResets())
        }
      } catch (e) {
        console.error('[ForgotPw] sync error:', e)
        showMsg('Request created but could not reach the server. Please try again.', 'error')
        return
      }

      showMsg('Your request has been sent to the admin. Please wait for the library admin to reset your password.', 'success')
      form.reset()
    } catch (err) {
      console.error('[ForgotPw]', err)
      showMsg('Could not send the request. Please check your internet connection and try again.', 'error')
    } finally {
      if (submitBtn) submitBtn.disabled = false
    }
  })
})()