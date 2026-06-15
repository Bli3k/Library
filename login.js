(function () {
  const form = document.getElementById('login-form')
  const errorEl = document.getElementById('login-error')

  const existing = LibraryAuth.getCurrentUser()
  if (existing) {
    window.location.href = existing.role === 'admin' ? 'admin.html' : 'student.html'
    return
  }

  form.addEventListener('submit', function (evt) {
    evt.preventDefault()
    errorEl.hidden = true

    const loginId = document.getElementById('login-id').value
    const password = document.getElementById('login-password').value
    const result = LibraryAuth.login(loginId, password)

    if (!result.ok) {
      errorEl.textContent = result.error
      errorEl.hidden = false
      return
    }

    window.location.href = result.user.role === 'admin' ? 'admin.html' : 'student.html'
  })

  const demoBtn = document.getElementById('demo-login')
  if (demoBtn) {
    demoBtn.addEventListener('click', function () {
      document.getElementById('login-id').value = 'admin'
      document.getElementById('login-password').value = 'admin123'
      if (typeof form.requestSubmit === 'function') form.requestSubmit()
      else {
        const btn = form.querySelector('button[type="submit"]')
        if (btn) btn.click()
      }
    })
  }
})()
