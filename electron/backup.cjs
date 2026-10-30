// Arquivo .notas para levar as notas de um computador para outro (ou guardar como backup).
// Por dentro é um .zip com o notes.json e a pasta anexos/. Sem dependência do Electron, para poder ser testado.
const path = require('node:path')
const fs = require('node:fs')
const AdmZip = require('adm-zip')
const { safeFileName, resolveAttachment } = require('./attachments.cjs')

const EXTENSION = 'notas'
const DATA_ENTRY = 'notes.json'
const ATTACHMENTS_FOLDER = 'anexos/'

// Grava as notas e só os anexos que alguma nota usa.
function writeBackup(file, data, attachmentsDir, referencedUrls) {
  const zip = new AdmZip()
  zip.addFile(DATA_ENTRY, Buffer.from(JSON.stringify(data)))
  for (const url of referencedUrls) {
    const full = resolveAttachment(attachmentsDir, url)
    if (full && fs.existsSync(full)) zip.addLocalFile(full, ATTACHMENTS_FOLDER)
  }
  zip.writeZip(file)
}

// Copia os anexos do arquivo para a pasta de anexos e devolve as notas, que a interface junta com as atuais.
// Anexos que já existem não são sobrescritos: o nome tem um prefixo aleatório, então é o mesmo arquivo.
function readBackup(file, attachmentsDir) {
  const invalid = () => new Error('Este arquivo não é um backup do Notas.')
  let zip, data
  try {
    zip = new AdmZip(file)
    data = JSON.parse(zip.readAsText(DATA_ENTRY))
  } catch {
    throw invalid()
  }
  if (!data || !Array.isArray(data.notes) || !Array.isArray(data.folders)) throw invalid()

  fs.mkdirSync(attachmentsDir, { recursive: true })
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || !entry.entryName.startsWith(ATTACHMENTS_FOLDER)) continue
    const name = path.basename(entry.entryName)
    // Ignora nomes estranhos (ex.: ../../Windows), que um arquivo adulterado poderia trazer.
    if (name !== safeFileName(name)) continue
    const dest = path.join(attachmentsDir, name)
    if (!fs.existsSync(dest)) fs.writeFileSync(dest, entry.getData())
  }
  return data
}

module.exports = { EXTENSION, writeBackup, readBackup }
