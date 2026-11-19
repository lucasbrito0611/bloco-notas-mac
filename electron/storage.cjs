// Leitura e gravação do notes.json. Sem dependência do Electron, para poder ser testado.
// Regra de ouro: nunca sobrescrever um arquivo ruim sem antes guardar uma cópia dele.
const path = require('node:path')
const fs = require('node:fs')

const FILE = 'notes.json'
const TMP = 'notes.json.tmp'
const BACKUP = 'notes.backup.json'

// Formato esperado: { folders: [...], notes: [...] }. Qualquer outra coisa é tratada como corrompida.
const isValid = (data) => !!data && Array.isArray(data.folders) && Array.isArray(data.notes)

// Tenta ler e validar um arquivo. Devolve { ok, data } sem lançar erro.
function tryRead(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return isValid(data) ? { ok: true, data } : { ok: false }
  } catch {
    return { ok: false }
  }
}

// Data-hora sem ":" (o Windows não aceita dois-pontos em nome de arquivo): 2026-11-19_14-30-05-123
function stamp(date = new Date()) {
  const p = (n, size = 2) => String(n).padStart(size, '0')
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_` +
    `${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}-${p(date.getMilliseconds(), 3)}`
  )
}

// Copia o arquivo ruim para notes.corrompido-<data-hora>.json. COPYFILE_EXCL não sobrescreve nada existente.
// Devolve o caminho da cópia; lança erro se não conseguir copiar.
function copyCorrupted(dir, file) {
  const base = path.join(dir, `notes.corrompido-${stamp()}`)
  for (let n = 0; ; n++) {
    const copy = `${base}${n ? `-${n}` : ''}.json`
    try {
      fs.copyFileSync(file, copy, fs.constants.COPYFILE_EXCL)
      return copy
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
    }
  }
}

// Lê as notas e diz o que aconteceu, para o processo principal avisar o usuário quando for preciso.
// status:
//   'vazio'      primeira execução (não existe arquivo): data = null
//   'ok'         arquivo válido: data = notas
//   'recuperado' o arquivo estava ruim, mas o .tmp (sobra de gravação interrompida) era válido: data = notas do .tmp
//   'corrompido' o arquivo estava ruim e não há .tmp válido: data = null, cópia em `copia`
//   'erro'       o arquivo estava ruim e nem a cópia de segurança foi possível: data = null (não gravar!)
function readNotes(dir) {
  const file = path.join(dir, FILE)
  const tmp = path.join(dir, TMP)

  if (!fs.existsSync(file)) {
    // Caso raro: a gravação parou depois de escrever o .tmp e antes do rename.
    const fromTmp = fs.existsSync(tmp) ? tryRead(tmp) : { ok: false }
    if (fromTmp.ok) return { status: 'recuperado', data: fromTmp.data, copia: null }
    return { status: 'vazio', data: null, copia: null }
  }

  const main = tryRead(file)
  if (main.ok) {
    // Uma cópia de segurança por abertura do app: se algo der errado nesta sessão, o estado do início fica guardado.
    try {
      fs.copyFileSync(file, path.join(dir, BACKUP))
    } catch {
      // Falhar aqui não pode impedir o app de abrir.
    }
    return { status: 'ok', data: main.data, copia: null }
  }

  // O arquivo principal está ruim. Antes de qualquer coisa, guarda uma cópia dele.
  let copia
  try {
    copia = copyCorrupted(dir, file)
  } catch {
    return { status: 'erro', data: null, copia: null }
  }

  const fromTmp = fs.existsSync(tmp) ? tryRead(tmp) : { ok: false }
  if (fromTmp.ok) return { status: 'recuperado', data: fromTmp.data, copia }
  return { status: 'corrompido', data: null, copia }
}

// Grava atomicamente: escreve num .tmp, força o disco a guardar (fsync) e só então renomeia por cima.
// Se o app fechar no meio, o notes.json antigo continua inteiro (e o .tmp fica para recuperação).
function saveNotes(dir, data) {
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, FILE)
  const tmp = path.join(dir, TMP)
  const fd = fs.openSync(tmp, 'w')
  try {
    fs.writeFileSync(fd, JSON.stringify(data))
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  fs.renameSync(tmp, file)
}

module.exports = { FILE, TMP, BACKUP, isValid, readNotes, saveNotes, stamp }
