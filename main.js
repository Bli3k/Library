const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')

let mainWindow
let splashWindow

// ── Prevent a second instance ────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// All files are flat in the root folder — just join with __dirname
function appFile (fileName) {
  return path.join(__dirname, fileName)
}

// ── Splash screen ────────────────────────────────────────────────
function createSplash () {
  splashWindow = new BrowserWindow({
    width: 500,
    height: 340,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    // Uses logo.png from your img/ folder as the window icon
    icon: appFile('img/logo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })
  // splash.html lives in the root alongside your other HTML files
  splashWindow.loadFile(appFile('splash.html'))
  splashWindow.center()
}

// ── Main window ──────────────────────────────────────────────────
function createMainWindow () {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    // Uses logo.png from your img/ folder as the window icon
    icon: appFile('img/logo.png'),
    title: 'BCST Library System',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: appFile('preload.js'),
      devTools: false,
      // Add this:
      allowRunningInsecureContent: false
    }
  })

  Menu.setApplicationMenu(null)

  // Load login.html directly — skips the index.html sessionStorage issue
  mainWindow.loadFile(appFile('index.html'))

  // Close splash and show main window once ready
  mainWindow.once('ready-to-show', () => {
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close()
        splashWindow = null
      }
      mainWindow.show()
    }, 2500)
  })

  // Open external http/https links in the system browser
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  // F11 toggles fullscreen
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen())
      event.preventDefault()
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ── App lifecycle ────────────────────────────────────────────────
app.whenReady().then(() => {
  createSplash()
  createMainWindow()

  mainWindow.once('ready-to-show', () => {
    if (app.isPackaged) {
      try { autoUpdater.checkForUpdatesAndNotify() } catch (e) {}
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
})

// ── Auto-updater ─────────────────────────────────────────────────
autoUpdater.on('update-available', () => {
  if (mainWindow) mainWindow.webContents.send('update-available')
})
autoUpdater.on('update-downloaded', () => {
  if (mainWindow) mainWindow.webContents.send('update-downloaded')
})
// ── Install downloaded update ─────────────────────────────
ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall()
})

process.on('uncaughtException', err => {
  console.error(err)
})

process.on('unhandledRejection', err => {
  console.error(err)
})