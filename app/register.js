(function () {
  const form = document.getElementById('register-form')
  const errorEl = document.getElementById('register-error')

  const existing = LibraryAuth.getCurrentUser()
  if (existing) {
    window.location.href = existing.role === 'admin' ? 'admin.html' : 'student.html'
    return
  }

  form.addEventListener('submit', function (evt) {
    evt.preventDefault()
    errorEl.hidden = true

    const password = document.getElementById('password').value
    const confirmPassword = document.getElementById('confirm-password').value
    if (password !== confirmPassword) {
      errorEl.textContent = 'Passwords do not match.'
      errorEl.hidden = false
      return
    }

    const result = LibraryAuth.register({
      name: document.getElementById('name').value,
      age: document.getElementById('age').value,
      courseStrand: document.getElementById('course-strand').value,
      year: document.getElementById('year').value,
      section: document.getElementById('section').value,
      address: document.getElementById('address').value,
      email: document.getElementById('email').value,
      contactNumber: document.getElementById('contact-number').value,
      password
    })

    if (!result.ok) {
      errorEl.textContent = result.error
      errorEl.hidden = false
      return
    }

    alert('Registration successful! You can now sign in with your email.')
    window.location.href = 'login.html'
  })
})()
