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

    // ── Auto-load sample Excel on first admin visit ───────────────────────────
    // Fires the Load Sample button once automatically so the demo works out of
    // the box without the admin needing to import anything manually.
    const isAdminPage =
      window.location.pathname.endsWith('/admin.html') ||
      window.location.pathname.endsWith('admin.html')

    if (isAdminPage) {
      try {
        const seen = localStorage.getItem('library_demo_sample_loaded_v1')
        if (!seen) {
          localStorage.setItem('library_demo_sample_loaded_v1', '1')
          const btnLoad = document.getElementById('load-sample-btn')
          if (btnLoad) setTimeout(function () { btnLoad.click() }, 500)
        }
      } catch (err) {}
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