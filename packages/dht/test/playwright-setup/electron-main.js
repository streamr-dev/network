/**
 * Minimal Electron main process for Playwright tests
 * This file gets loaded when Electron launches for tests
 */

const { app, BrowserWindow } = require('electron')
const path = require('path')

let mainWindow = null

async function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js')
  console.log('Loading preload from:', preloadPath)
  
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    show: false, // Don't show window during tests
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      preload: preloadPath,
      webSecurity: false,
      sandbox: false
    }
  })

  // Load a blank page
  await mainWindow.loadURL('about:blank')
  
  console.log('Window loaded')
  
  return mainWindow
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

