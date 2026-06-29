// Forgot password request screen
(function () {
  var form = document.getElementById('forgot-form')
  var emailInput = document.getElementById('forgot-email')
  var submitBtn = document.getElementById('forgot-submit')
  var msg = document.getElementById('forgot-msg')

  if (!form) return

  function showMsg(text, type) {
    if (!msg) return
    msg.textContent = text
    msg.className = 'request-msg ' + type
  }

  function waitForFirebaseReady(timeoutMs) {
    if ('LibraryFirebase' in window) return Promise.resolve()
    return new Promise(function (resolve) {
      var done = false
      var timer = setTimeout(function () {
        if (done) return
        done = true
        resolve()
      }, timeoutMs || 2500)
      window.addEventListener('libraryFirebaseReady', function () {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve()
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
    showMsg('Sending your request...', 'success')

    try {
      await waitForFirebaseReady(3000)
      if (window.LibraryFirebase && window.LibraryFirebase.pullUsers) {
        await window.LibraryFirebase.pullUsers()
      }

      var result = LibraryAuth.createPasswordResetRequest(email, '')
      if (!result.ok) {
        showMsg(result.error, 'error')
        return
      }

      if (window.LibraryFirebase && window.LibraryFirebase.syncPwResets) {
        window.LibraryFirebase.syncPwResets(LibraryAuth.loadPwResets())
      }
      showMsg('Your request has been sent to the admin. Please wait for the library admin to reset your password.', 'success')
      form.reset()
    } catch (err) {
      showMsg('Could not send the request. Please try again.', 'error')
    } finally {
      if (submitBtn) submitBtn.disabled = false
    }
  })
})()
