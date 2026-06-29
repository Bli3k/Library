// login.js — Login page logic
(function () {
  // Redirect already-logged-in users immediately
  const existing = LibraryAuth.getCurrentUser()
  if (existing) {
    window.location.replace(existing.role === 'admin' ? 'admin.html' : 'student.html')
    return
  }

  const form    = document.getElementById('login-form')
  const errorEl = document.getElementById('login-error')

  form.addEventListener('submit', function (evt) {
    evt.preventDefault()
    errorEl.hidden = true
    const loginId  = document.getElementById('login-id').value.trim()
    const password = document.getElementById('login-password').value
    const result   = LibraryAuth.login(loginId, password)
    if (!result.ok) {
      errorEl.textContent = result.error
      errorEl.hidden      = false
      return
    }
    window.location.replace(result.user.role === 'admin' ? 'admin.html' : 'student.html')
  })

  // ── Forgot Password modal ─────────────────────────────────────────────────
  var forgotBtn    = document.getElementById('forgot-btn')
  var forgotModal  = document.getElementById('forgot-modal')
  var forgotClose  = document.getElementById('forgot-close')
  var forgotSubmit = document.getElementById('forgot-submit')
  var forgotMsg    = document.getElementById('forgot-msg')

  function openModal() {
    if (forgotModal) forgotModal.classList.add('open')
    var emailInput = document.getElementById('login-id').value.trim()
    var forgotEmail = document.getElementById('forgot-email')
    if (forgotEmail && emailInput) forgotEmail.value = emailInput
    if (forgotMsg) forgotMsg.style.display = 'none'
  }

  function closeModal() {
    if (forgotModal) forgotModal.classList.remove('open')
  }

  if (forgotBtn)   forgotBtn.addEventListener('click', openModal)
  if (forgotClose) forgotClose.addEventListener('click', closeModal)

  // Close on backdrop click
  if (forgotModal) {
    forgotModal.addEventListener('click', function (e) {
      if (e.target === forgotModal) closeModal()
    })
  }

  if (forgotSubmit) {
    forgotSubmit.addEventListener('click', function () {
      var email  = (document.getElementById('forgot-email').value || '').trim()
      var reason = (document.getElementById('forgot-reason').value || '').trim()

      if (!email) {
        showForgotMsg('Please enter your email address.', 'error')
        return
      }

      var result = LibraryAuth.createPasswordResetRequest(email, reason)
      if (!result.ok) {
        showForgotMsg(result.error, 'error')
        return
      }

      showForgotMsg(
        'Your request has been sent! Please visit the library and the admin will reset your password for you.',
        'success'
      )
      // Auto-close after 3 seconds
      setTimeout(closeModal, 3000)
    })
  }

  function showForgotMsg(text, type) {
    if (!forgotMsg) return
    forgotMsg.textContent   = text
    forgotMsg.style.display = 'block'
    if (type === 'success') {
      forgotMsg.style.background  = 'var(--green-lt)'
      forgotMsg.style.color       = 'var(--green-md)'
      forgotMsg.style.borderLeft  = '3px solid var(--green)'
    } else {
      forgotMsg.style.background  = 'var(--danger-lt)'
      forgotMsg.style.color       = 'var(--danger)'
      forgotMsg.style.borderLeft  = '3px solid var(--danger)'
    }
  }
})()