// Onde e como os anexos ficam guardados no disco. Sem dependência do Electron, para poder ser testado.
const path = require('node:path')
const crypto = require('node:crypto')

const SCHEME = 'notas'
const HOST = 'anexos'

// Tira caracteres que o Windows não aceita em nomes de arquivo e limita o tamanho.
function safeFileName(name) {
  const clean = String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(-120)
  return clean || 'arquivo'
}

// Cada anexo ganha um prefixo aleatório, para dois arquivos com o mesmo nome não se sobrescreverem.
function storedName(originalName) {
  return `${crypto.randomUUID().slice(0, 8)}-${safeFileName(originalName)}`
}

const urlFor = (fileName) => `${SCHEME}://${HOST}/${encodeURIComponent(fileName)}`

// Converte notas://anexos/<arquivo> no caminho real dentro da pasta de anexos.
// Devolve null para qualquer endereço que tente sair da pasta (ex.: ../../Windows).
function resolveAttachment(dir, url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${SCHEME}:` || parsed.hostname !== HOST) return null
  const fileName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
  if (!fileName || fileName.includes('/') || fileName.includes('\\')) return null
  const full = path.resolve(dir, fileName)
  if (path.dirname(full) !== path.resolve(dir)) return null
  return full
}

const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
}
const mimeFor = (name) => MIME[path.extname(name).slice(1).toLowerCase()] || 'application/octet-stream'

module.exports = { SCHEME, HOST, safeFileName, storedName, urlFor, resolveAttachment, mimeFor }
