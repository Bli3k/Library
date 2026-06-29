// ui.js — UI helpers: mobile nav toggle, connection status indicator, auto-load sample
(function () {
  document.addEventListener('DOMContentLoaded', function () {

    // ── Mobile nav toggle ────────────────────────────────────────────────────
    const hamburger = document.querySelector('.hamburger')
    const navLinks  = document.querySelector('.nav-links')
    if (hamburger && navLinks) {
      hamburger.addEventListener('click', function () {
        const open = hamburger.getAttribute('aria-expanded') === 'true'
        hamburger.setAttribute('aria-expanded', open ? 'false' : 'true')
        navLinks.setAttribute('aria-hidden', open ? 'true' : 'false')
        navLinks.classList.toggle('open')
      })
    }

    // Auto-load sample removed — it triggered saveBooks() → Firebase sync →
    // onSnapshot → pullBooks() on every page open, causing a continuous sync loop.

    // ── Eye toggle — password reveal for all .eye-btn buttons ──────────────────
    // Uses event delegation so it works for dynamically added buttons too
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.eye-btn')
      if (!btn) return
      var targetId = btn.dataset.target
      var input    = targetId ? document.getElementById(targetId) : btn.previousElementSibling
      if (!input) return
      var isHidden = input.type === 'password'
      input.type   = isHidden ? 'text' : 'password'
      // Swap icon: open eye <-> closed eye
      btn.innerHTML = isHidden
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
    })

    // ── Contact number input — digits only, max 11 ─────────────────────────────
    var contactInput = document.getElementById('contact-number')
    if (contactInput) {
      contactInput.addEventListener('input', function () {
        // Strip non-numeric characters as user types
        var cleaned = this.value.replace(/[^0-9]/g, '')
        if (cleaned.length > 11) cleaned = cleaned.slice(0, 11)
        this.value = cleaned
      })
      contactInput.addEventListener('keypress', function (e) {
        // Block non-numeric key presses
        if (!/[0-9]/.test(e.key)) e.preventDefault()
      })
    }

    // ── Network / connection status indicator ────────────────────────────────
    // Updates the "Online / Offline" pill in the page header.
    // Note: the Firebase status pill is handled separately by firebase-sync.js.
    try {
      function updateConnectionUI(online) {
        const status  = document.getElementById('connection-status')
        const syncBtn = document.getElementById('sync-btn')   // the manual POST sync btn

        if (status) {
          status.textContent = online ? 'Online' : 'Offline'
          status.classList.remove('online', 'offline')
          status.classList.add(online ? 'online' : 'offline')
        }

        // Disable the manual POST sync button when offline
        if (syncBtn) syncBtn.disabled = !online
      }

      updateConnectionUI(navigator.onLine)
      window.addEventListener('online',  function () { updateConnectionUI(true)  })
      window.addEventListener('offline', function () { updateConnectionUI(false) })
    } catch (err) {}

  })
})()