// Gera build/icon.png e build/icon.ico a partir de build/icon.svg.
// Uso: npm run icon
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const SIZES = [16, 24, 32, 48, 64, 128, 256]
const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8')
const svgUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')

// Desenha o SVG num <canvas> da página e devolve o PNG.
async function render(win, size) {
  const dataUrl = await win.webContents.executeJavaScript(`new Promise((ok, fail) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = c.height = ${size}
      const ctx = c.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, ${size}, ${size})
      ok(c.toDataURL('image/png'))
    }
    img.onerror = () => fail(new Error('SVG inválido'))
    img.src = ${JSON.stringify(svgUrl)}
  })`)
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

// ICO com as imagens PNG embutidas (formato aceito desde o Windows Vista).
function toIco(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  let offset = 6 + 16 * pngs.length
  const entries = pngs.map(({ size, png }) => {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0)
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += png.length
    return e
  })
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.png)])
}

process.on('unhandledRejection', (e) => {
  console.error('Erro ao gerar o ícone:', e)
  app.exit(1)
})

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false })
  await win.loadURL('about:blank')
  const pngs = []
  for (const size of SIZES) pngs.push({ size, png: await render(win, size) })
  fs.writeFileSync(path.join(__dirname, 'icon.ico'), toIco(pngs))
  fs.writeFileSync(path.join(__dirname, 'icon.png'), await render(win, 512))
  console.log('icon.ico e icon.png gerados')
  app.quit()
})
