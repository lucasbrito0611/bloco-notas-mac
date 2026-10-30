const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const isDev = process.argv.includes('--dev')
const dataFile = () => path.join(app.getPath('userData'), 'notes.json')

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(dataFile(), 'utf8'))
  } catch {
    return null
  }
}

function saveData(data) {
  // Escreve num arquivo temporário e renomeia, para não corromper se o app fechar no meio.
  const tmp = dataFile() + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data))
  fs.renameSync(tmp, dataFile())
}

function createWindow() {
  const dark = nativeTheme.shouldUseDarkColors
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 760,
    minHeight: 480,
    title: 'Notas',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    backgroundMaterial: 'mica',
    backgroundColor: '#00000000',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: dark ? '#e8e8e8' : '#1f1f1f',
      height: 44,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
    },
  })

  nativeTheme.on('updated', () => {
    win.setTitleBarOverlay({
      symbolColor: nativeTheme.shouldUseDarkColors ? '#e8e8e8' : '#1f1f1f',
    })
  })

  if (isDev) win.loadURL('http://localhost:5173')
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

ipcMain.handle('notes:load', () => loadData())
ipcMain.handle('notes:save', (_e, data) => saveData(data))

// Faz o Windows tratar o app como "Notas" na barra de tarefas, e não como Electron.
app.setAppUserModelId('com.lucas.notas')
app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
