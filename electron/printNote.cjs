// PDF e impressão de UMA nota, usando uma janela escondida.
//
// Por que uma janela escondida? É como abrir a nota numa aba nova do navegador só com o
// conteúdo e um CSS de impressão, sem a interface do app (barra lateral, lista, botões).
// O Chromium dessa janela então gera o PDF (printToPDF) ou abre a janela de impressão do Windows.
const { BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const crypto = require('node:crypto')
const { buildPrintHtml } = require('./exportNote.cjs')

// A fonte Inter vai embutida na página (base64), para o PDF sair igual mesmo sem internet
// e sem depender de onde o app está instalado. Só as partes latinas (português, inglês etc.).
let cachedFontCss = null
function interFontCss() {
  if (cachedFontCss !== null) return cachedFontCss
  try {
    const dir = path.dirname(require.resolve('@fontsource-variable/inter/opsz.css'))
    cachedFontCss = ['opsz.css', 'opsz-italic.css']
      .map((file) => fs.readFileSync(path.join(dir, file), 'utf8'))
      .join('\n')
      // Cada bloco começa com um comentário como /* inter-latin-opsz-normal */.
      .split(/(?=\/\*)/)
      .filter((block) => /\/\* inter-latin(-ext)?-/.test(block))
      .map((block) =>
        block.replace(/url\(\.\/files\/([^)]+)\)/g, (_m, file) => {
          const data = fs.readFileSync(path.join(dir, 'files', path.basename(file))).toString('base64')
          return `url(data:font/woff2;base64,${data})`
        }),
      )
      .join('\n')
  } catch {
    cachedFontCss = '' // sem a Inter, o CSS cai na Segoe UI
  }
  return cachedFontCss
}

// Abre a nota numa janela escondida, espera fontes e imagens carregarem e roda fn(webContents).
// A janela e o arquivo temporário são sempre apagados no fim, mesmo se der erro.
async function withPrintWindow(parent, { title, html }, fn) {
  const tmp = path.join(os.tmpdir(), `notas-impressao-${crypto.randomUUID().slice(0, 8)}.html`)
  fs.writeFileSync(tmp, buildPrintHtml({ title, html, fontCss: interFontCss() }))
  const printWin = new BrowserWindow({
    show: false,
    parent: parent || undefined,
    width: 800,
    height: 1100,
    webPreferences: {
      // Usa a mesma sessão da janela principal, onde o protocolo notas:// (imagens) está registrado.
      session: parent?.webContents.session,
      sandbox: true,
      contextIsolation: true,
      // O JavaScript fica ligado só para o app perguntar "as fontes e imagens já carregaram?".
      // A página em si não roda scripts: a CSP do buildPrintHtml proíbe.
      javascript: true,
    },
  })
  // Nada de abrir links ou navegar para outro lugar a partir dessa janela.
  printWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  printWin.webContents.on('will-navigate', (e) => e.preventDefault())
  try {
    await printWin.loadFile(tmp)
    await printWin.webContents.executeJavaScript(
      'document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))))',
    )
    return await fn(printWin.webContents)
  } finally {
    if (!printWin.isDestroyed()) printWin.destroy()
    fs.rmSync(tmp, { force: true })
  }
}

// Gera o PDF e devolve os bytes (Buffer).
function renderPdf(parent, note) {
  return withPrintWindow(parent, note, (contents) =>
    contents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      preferCSSPageSize: true, // usa as margens do @page do CSS de impressão
    }),
  )
}

// Abre a janela de impressão do Windows. Devolve true se imprimiu, false se o usuário cancelou.
function printNote(parent, note) {
  return withPrintWindow(
    parent,
    note,
    (contents) =>
      new Promise((resolve, reject) => {
        contents.print({ silent: false, printBackground: true }, (success, reason) => {
          if (success || reason === 'cancelled' || reason === 'Print job canceled') resolve(success)
          else reject(new Error(reason || 'Não foi possível imprimir.'))
        })
      }),
  )
}

module.exports = { renderPdf, printNote, interFontCss }
