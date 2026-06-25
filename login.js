// login.js — Login page logic
(function () {
  // Redirect already-logged-in users immediately
  const existing = LibraryAuth.getCurrentUser()
  if (existing) {
    window.location.replace(
      existing.role === 'admin' ? 'admin.html' : 'student.html'
    )
    return
  }

  const form = document.getElementById('login-form')
  const errorEl = document.getElementById('login-error')

  form.addEventListener('submit', function (evt) {
    evt.preventDefault()
    errorEl.hidden = true

    const loginId = document.getElementById('login-id').value.trim()
    const password = document.getElementById('login-password').value
    const result = LibraryAuth.login(loginId, password)

    if (!result.ok) {
      errorEl.textContent = result.error
      errorEl.hidden = false
      return
    }

    window.location.replace(
      result.user.role === 'admin'
        ? 'admin.html'
        : 'student.html'
    )
  })

  // Demo admin quick-login button
  const demoBtn = document.getElementById('demo-login')

  if (demoBtn) {
    demoBtn.addEventListener('click', function () {
      document.getElementById('login-id').value = 'admin'
      document.getElementById('login-password').value = 'admin123'

      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit()
      } else {
        const submitBtn = form.querySelector('button[type="submit"]')
        if (submitBtn) submitBtn.click()
      }
    })
  }
})()