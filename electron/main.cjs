const { app, BrowserWindow, ipcMain, nativeTheme, protocol, net, shell, dialog, Menu } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const attachments = require('./attachments.cjs')
const backup = require('./backup.cjs')
const storage = require('./storage.cjs')

const isDev = process.argv.includes('--dev')

// Permite rodar com outra pasta de dados (usado nos testes, para não mexer nas notas de verdade).
if (process.env.NOTAS_DATA_DIR) app.setPath('userData', process.env.NOTAS_DATA_DIR)

const attachmentsDir = () => path.join(app.getPath('userData'), 'anexos')

// Resultado da última leitura do notes.json (ver storage.cjs). Decide se podemos gravar e limpar anexos.
let leitura = null

function loadData() {
  leitura = storage.readNotes(app.getPath('userData'))
  avisarLeitura(leitura)
  return leitura.data
}

// Avisa o usuário, sem travar a abertura, quando o arquivo de notas estava danificado.
function avisarLeitura(r) {
  const pasta = app.getPath('userData')
  const aviso = {
    recuperado: {
      message: r.copia ? 'O arquivo de notas estava danificado.' : 'O arquivo de notas não estava lá.',
      detail:
        'Recuperei suas notas do salvamento que tinha sido interrompido.' +
        (r.copia ? ` O arquivo danificado foi guardado em:\n${r.copia}` : ''),
    },
    corrompido: {
      message: 'Não consegui ler o arquivo de notas.',
      detail:
        'O arquivo estava danificado, então o app abriu com um caderno novo. ' +
        `Uma cópia do arquivo danificado foi guardada em:\n${r.copia}\n\n` +
        `Se existir, o arquivo ${storage.BACKUP} (em ${pasta}) guarda o estado de quando o app abriu pela última vez.`,
    },
    erro: {
      message: 'Não consegui ler o arquivo de notas.',
      detail:
        `O arquivo está em ${path.join(pasta, storage.FILE)} e não consegui guardar uma cópia dele. ` +
        'Para não piorar a situação, nada será salvo nesta sessão. Feche o app e guarde esse arquivo em outro lugar antes de abrir de novo.',
    },
  }[r.status]
  if (!aviso) return
  const opcoes = { type: 'warning', title: 'Notas', ...aviso }
  // Sem janela ainda, a caixa de mensagem fica sem dono (o Electron aceita os dois formatos).
  const mostrar = win ? dialog.showMessageBox(win, opcoes) : dialog.showMessageBox(opcoes)
  mostrar.catch(() => {})
}

function saveData(data) {
  if (leitura?.status === 'erro') {
    throw new Error('Não foi possível salvar: o arquivo de notas está danificado e nenhuma cópia pôde ser guardada.')
  }
  if (!storage.isValid(data)) throw new Error('Dados de notas inválidos: nada foi salvo.')
  storage.saveNotes(app.getPath('userData'), data)
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

// Apaga do disco os anexos que nenhuma nota usa mais (ex.: a nota foi apagada de vez).
// Só apaga arquivos com mais de 1 hora: um anexo recém-colado pode ainda não ter sido salvo na nota.
function cleanupAttachments(referencedUrls) {
  // Com o arquivo de notas danificado, a lista de anexos em uso não é confiável: não apaga nada.
  if (leitura?.status === 'corrompido' || leitura?.status === 'erro') return 0
  if (!fs.existsSync(attachmentsDir())) return 0
  const oneHourAgo = Date.now() - 60 * 60 * 1000
  const orphans = attachments
    .orphanFiles(fs.readdirSync(attachmentsDir()), referencedUrls)
    .filter((name) => fs.statSync(path.join(attachmentsDir(), name)).mtimeMs < oneHourAgo)
  for (const name of orphans) fs.rmSync(path.join(attachmentsDir(), name), { force: true })
  return orphans.length
}

// ---------- exportar e importar (arquivo .notas) ----------

const backupFilter = { name: 'Backup do Notas', extensions: [backup.EXTENSION] }

// Devolve false se o usuário cancelar a janela de salvar.
async function exportNotes(data, referencedUrls) {
  const today = new Date().toLocaleDateString('sv-SE') // 2026-10-30
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Exportar notas',
    defaultPath: path.join(app.getPath('documents'), `Notas ${today}.${backup.EXTENSION}`),
    filters: [backupFilter],
  })
  if (canceled || !filePath) return false
  backup.writeBackup(filePath, data, attachmentsDir(), referencedUrls)
  return true
}

// Devolve null se o usuário cancelar; senão, as notas do arquivo (a interface junta com as atuais).
async function importNotes() {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Importar notas',
    filters: [backupFilter],
    properties: ['openFile'],
  })
  if (canceled || !filePaths[0]) return null
  return backup.readBackup(filePaths[0], attachmentsDir())
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

// Só uma janela do Notas por vez: duas instâncias gravariam o mesmo notes.json uma por cima da outra.
// Como um "app já aberto" no navegador: a segunda vez só traz a primeira para frente.
const primeiraInstancia = app.requestSingleInstanceLock()
if (!primeiraInstancia) app.quit()
app.on('second-instance', () => {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
})

// Fechamento: antes de fechar, a interface grava o que foi digitado nos últimos 300 ms e confirma.
let fechamentoAprovado = false // true depois da gravação: o próximo "close" fecha de verdade
let confirmarGravacao = null // função que fecha a janela, guardada enquanto a interface não confirma
const TEMPO_LIMITE_GRAVACAO = 2000 // rede de segurança: se a interface travar, fecha mesmo assim

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

  // Primeiro "close" é cancelado para dar tempo de gravar; depois a janela fecha de verdade.
  win.on('close', (event) => {
    if (fechamentoAprovado) return
    event.preventDefault()
    if (confirmarGravacao) return // já está esperando a interface gravar
    const fechar = () => {
      clearTimeout(rede)
      confirmarGravacao = null
      fechamentoAprovado = true
      if (win && !win.isDestroyed()) win.close()
    }
    const rede = setTimeout(fechar, TEMPO_LIMITE_GRAVACAO)
    confirmarGravacao = fechar
    if (win.webContents.isDestroyed()) return fechar()
    win.webContents.send('app:before-close')
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

// A interface pode abrir depois que a verificação terminou, então guardamos o último aviso
// para ela pedir quando estiver pronta (update:get).
let lastUpdateEvent = null

function setupUpdates() {
  // Só verifica; o download começa quando o usuário aceitar no modal.
  autoUpdater.autoDownload = false
  // Se o usuário recusou, nada é instalado escondido ao fechar o app.
  autoUpdater.autoInstallOnAppQuit = false

  const send = (event) => {
    if (event.type === 'available') lastUpdateEvent = event
    win?.webContents.send('update:status', event)
  }
  autoUpdater.on('update-available', (info) => send({ type: 'available', version: info.version }))
  autoUpdater.on('download-progress', (p) => send({ type: 'progress', percent: p.percent }))
  autoUpdater.on('update-downloaded', (info) => send({ type: 'downloaded', version: info.version }))
  autoUpdater.on('error', (err) => send({ type: 'error', message: err?.message }))

  const check = () => autoUpdater.checkForUpdates().catch(() => {})
  check()
  // Quem deixa o app aberto o dia todo também fica sabendo das versões novas.
  setInterval(check, 4 * 60 * 60 * 1000)
}

ipcMain.handle('notes:load', () => loadData())
ipcMain.handle('notes:save', (_e, data) => saveData(data))
ipcMain.handle('notes:export', (_e, data, referencedUrls) => exportNotes(data, referencedUrls))
ipcMain.handle('notes:import', () => importNotes())
ipcMain.handle('attachments:save', (_e, file) => saveAttachment(file))
ipcMain.handle('attachments:cleanup', (_e, referencedUrls) => cleanupAttachments(referencedUrls))
ipcMain.handle('attachments:open', (_e, url) => {
  const file = attachments.resolveAttachment(attachmentsDir(), url)
  if (file) return shell.openPath(file)
})
ipcMain.handle('update:get', () => lastUpdateEvent)
ipcMain.handle('update:download', () => autoUpdater.downloadUpdate())
// quitAndInstall(isSilent, isForceRunAfter): instala sem mostrar a tela do instalador e reabre o app sozinho.
ipcMain.handle('update:install', () => autoUpdater.quitAndInstall(true, true))
ipcMain.handle('app:version', () => app.getVersion())
// A interface avisa que já gravou; aí a janela pode fechar.
ipcMain.handle('app:close-ready', () => confirmarGravacao?.())

// Faz o Windows tratar o app como "Notas" na barra de tarefas, e não como Electron.
app.setAppUserModelId('com.lucas.notas')
app.whenReady().then(() => {
  if (!primeiraInstancia) return
  // Menu enxuto: evita que o menu padrão do Electron roube Ctrl+=/-/0 (zoom) e Ctrl+C/X (copiar/recortar linha).
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Janela',
        submenu: [
          ...(isDev ? [{ role: 'reload' }, { role: 'forceReload' }] : []),
          { role: 'toggleDevTools' },
          { role: 'togglefullscreen' },
          { role: 'close' },
        ],
      },
    ]),
  )
  serveAttachments()
  createWindow()
  if (app.isPackaged) setupUpdates()
})
app.on('window-all-closed', () => app.quit())
