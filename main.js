const { app, BrowserWindow, Menu, shell } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')

let mainWindow
let splashWindow

// ── Prevent a second instance from opening ──────────────────────
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

// ── Create splash screen ─────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 500,
    height: 340,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    icon: path.join(__dirname, 'img/logo.ico'),
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  })
  splashWindow.loadFile(path.join(__dirname, 'splash.html'))
  splashWindow.center()
}

// ── Create main window ───────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,                          // hidden until ready
    icon: path.join(__dirname, 'img/icon.ico'),
    title: 'BCST Library System',
    webPreferences: {
      nodeIntegration: false,             // security: no Node in renderer
      contextIsolation: true,             // security: isolated context
      preload: path.join(__dirname, 'preload.js'),
      devTools: false                     // ← disables DevTools for users
    }
  })

  // Remove the default menu bar completely
  Menu.setApplicationMenu(null)

  // Load your app
  mainWindow.loadFile(path.join(__dirname, 'index.html'))

  // Show main window and close splash when ready
  mainWindow.once('ready-to-show', () => {
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close()
        splashWindow = null
      }
      mainWindow.show()
      // Uncomment the line below if you want fullscreen by default:
      // mainWindow.setFullScreen(true)
    }, 2500) // splash shows for 2.5 seconds minimum
  })

  // Prevent navigation to external URLs inside the app window
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const appUrl = 'file://'
    if (!url.startsWith(appUrl)) {
      event.preventDefault()
      shell.openExternal(url)  // open in browser instead
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ── App ready ────────────────────────────────────────────────────
app.whenReady().then(() => {
  createSplash()
  createMainWindow()

  // Check for updates after window is ready (only works in production build)
  mainWindow.once('ready-to-show', () => {
    autoUpdater.checkForUpdatesAndNotify()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
})

// ── Auto-updater events ──────────────────────────────────────────
autoUpdater.on('update-available', () => {
  mainWindow?.webContents.send('update-available')
})
autoUpdater.on('update-downloaded', () => {
  mainWindow?.webContents.send('update-downloaded')
})