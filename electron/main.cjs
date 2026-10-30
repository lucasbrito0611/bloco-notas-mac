const { app, BrowserWindow, ipcMain, nativeTheme, protocol, net, shell } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const attachments = require('./attachments.cjs')

const isDev = process.argv.includes('--dev')

// Permite rodar com outra pasta de dados (usado nos testes, para não mexer nas notas de verdade).
if (process.env.NOTAS_DATA_DIR) app.setPath('userData', process.env.NOTAS_DATA_DIR)

const dataFile = () => path.join(app.getPath('userData'), 'notes.json')
const attachmentsDir = () => path.join(app.getPath('userData'), 'anexos')

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

function saveAttachment({ name, type, bytes }) {
  fs.mkdirSync(attachmentsDir(), { recursive: true })
  const fileName = attachments.storedName(name)
  const buffer = Buffer.from(bytes)
  fs.writeFileSync(path.join(attachmentsDir(), fileName), buffer)
  return {
    url: attachments.urlFor(fileName),
    name: attachments.safeFileName(name),
    size: buffer.length,
    mime: type || attachments.mimeFor(name),
  }
}

// notas://anexos/<arquivo> funciona como um "servidor de arquivos" local para as imagens e anexos das notas.
protocol.registerSchemesAsPrivileged([
  { scheme: attachments.SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
])

function serveAttachments() {
  protocol.handle(attachments.SCHEME, (request) => {
    const file = attachments.resolveAttachment(attachmentsDir(), request.url)
    if (!file || !fs.existsSync(file)) return new Response('Anexo não encontrado', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
}

let win

function createWindow() {
  const dark = nativeTheme.shouldUseDarkColors
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 760,
    minHeight: 480,
    title: 'Notas',
    // Instalado, a janela usa o ícone do próprio Notas.exe; rodando pelo npm, aponta para o arquivo.
    icon: app.isPackaged ? undefined : path.join(__dirname, '..', 'build', 'icon.ico'),
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

  // Links dentro das notas abrem no navegador, não dentro do app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) win.loadURL('http://localhost:5173')
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

// ---------- atualização automática ----------

function setupUpdates() {
  const send = (status) => win?.webContents.send('update:status', status)
  autoUpdater.on('download-progress', (p) => send({ state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => send({ state: 'ready', version: info.version }))
  // Procura uma versão nova no GitHub Releases e baixa em segundo plano.
  // Se o usuário não clicar em "Reiniciar", ela é instalada quando o app fechar.
  autoUpdater.checkForUpdates().catch(() => {})
}

ipcMain.handle('notes:load', () => loadData())
ipcMain.handle('notes:save', (_e, data) => saveData(data))
ipcMain.handle('attachments:save', (_e, file) => saveAttachment(file))
ipcMain.handle('attachments:open', (_e, url) => {
  const file = attachments.resolveAttachment(attachmentsDir(), url)
  if (file) return shell.openPath(file)
})
ipcMain.handle('update:install', () => autoUpdater.quitAndInstall())
ipcMain.handle('app:version', () => app.getVersion())

// Faz o Windows tratar o app como "Notas" na barra de tarefas, e não como Electron.
app.setAppUserModelId('com.lucas.notas')
app.whenReady().then(() => {
  serveAttachments()
  createWindow()
  if (app.isPackaged) setupUpdates()
})
app.on('window-all-closed', () => app.quit())
