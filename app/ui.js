// UI helpers: mobile nav and auto-load sample on first admin visit
(function () {
  // Mobile nav toggle
  document.addEventListener('DOMContentLoaded', function () {
    const btn = document.querySelector('.hamburger')
    const nav = document.querySelector('.nav-links')
    if (btn && nav) {
      btn.addEventListener('click', function () {
        const open = btn.getAttribute('aria-expanded') === 'true'
        btn.setAttribute('aria-expanded', open ? 'false' : 'true')
        nav.setAttribute('aria-hidden', open ? 'true' : 'false')
        nav.classList.toggle('open')
      })
    }

    // Auto-load sample on first admin visit
    if (window.location.pathname.endsWith('/admin.html') || window.location.pathname.endsWith('admin.html')) {
      try {
        const seen = localStorage.getItem('library_demo_sample_loaded_v1')
        if (!seen) {
          // mark seen so it's not auto-loaded again
          localStorage.setItem('library_demo_sample_loaded_v1', '1')
          // trigger the loadSample button if present
          const btnLoad = document.getElementById('load-sample-btn')
          if (btnLoad) setTimeout(function () { btnLoad.click() }, 400)
        }
      } catch (err) {}
    }

      // Automatic network detection and UI update (applies to admin & student pages)
      try {
        function updateConnectionUI(online) {
          const status = document.getElementById('connection-status')
          const onlineMode = document.getElementById('online-mode')
          const syncStatus = document.getElementById('sync-status')
          const syncBtn = document.getElementById('sync-btn')
          if (status) {
            status.textContent = online ? 'Online' : 'Offline'
            status.classList.remove('online', 'offline', 'muted')
            status.classList.add(online ? 'online' : 'offline')
          }
          if (onlineMode) {
            try { onlineMode.checked = online } catch (err) {}
          }
          if (syncStatus) {
            syncStatus.textContent = online ? 'Connected' : 'Offline'
          }
          if (syncBtn) {
            syncBtn.disabled = !online
          }
        }

        updateConnectionUI(navigator.onLine)
        window.addEventListener('online', function () { updateConnectionUI(true) })
        window.addEventListener('offline', function () { updateConnectionUI(false) })
      } catch (err) {}
  })
})()
