// Leitura e gravação do notes.json. Sem dependência do Electron, para poder ser testado.
// Regra de ouro: nunca sobrescrever um arquivo ruim, nem a última cópia boa, sem antes guardar uma cópia dele.
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
    // Tira o BOM (marca invisível que alguns editores e o PowerShell 5 põem no começo do arquivo).
    const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''))
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

// Copia um arquivo para <prefixo>-<data-hora>.json. COPYFILE_EXCL nunca sobrescreve uma cópia anterior.
// Devolve o caminho da cópia; lança erro se não conseguir copiar.
function copiarComDataHora(dir, origem, prefixo) {
  const base = path.join(dir, `${prefixo}-${stamp()}`)
  for (let n = 0; ; n++) {
    const copia = `${base}${n ? `-${n}` : ''}.json`
    try {
      fs.copyFileSync(origem, copia, fs.constants.COPYFILE_EXCL)
      return copia
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
    }
  }
}

// Antes de o notes.backup.json ser trocado pela cópia de uma abertura válida, guarda o que ele tinha.
// Sem isso, a última cópia boa sumiria na abertura seguinte ao arquivo danificado.
function guardarBackupAntigo(dir) {
  const backup = path.join(dir, BACKUP)
  if (!fs.existsSync(backup)) return null
  try {
    return copiarComDataHora(dir, backup, 'notes.backup-antigo')
  } catch {
    return null
  }
}

const resultado = (status, data, extra = {}) => ({ status, data, copia: null, backupAntigo: null, ...extra })

// Lê as notas e diz o que aconteceu, para o processo principal avisar o usuário quando for preciso.
// status:
//   'vazio'      primeira execução (não existe arquivo): data = null
//   'ok'         arquivo válido: data = notas (e o notes.backup.json é atualizado)
//   'recuperado' o arquivo estava ruim (ou sumiu), mas o .tmp (sobra de gravação interrompida) era válido: data = notas do .tmp
//   'corrompido' o arquivo estava ruim e não há .tmp válido: data = null
//   'erro'       o arquivo estava ruim e nem a cópia de segurança foi possível: data = null (não gravar!)
// copia: cópia do arquivo ruim (notes.corrompido-<data-hora>.json). backupAntigo: notes.backup.json preservado antes de ser trocado.
function readNotes(dir) {
  const file = path.join(dir, FILE)
  const tmp = path.join(dir, TMP)
  const lerTmp = () => (fs.existsSync(tmp) ? tryRead(tmp) : { ok: false })

  if (!fs.existsSync(file)) {
    // Caso raro: a gravação parou depois de escrever o .tmp e antes do rename.
    const doTmp = lerTmp()
    return doTmp.ok ? resultado('recuperado', doTmp.data) : resultado('vazio', null)
  }

  const main = tryRead(file)
  if (main.ok) {
    // Uma cópia de segurança por abertura do app: se algo der errado nesta sessão, o estado do início fica guardado.
    try {
      fs.copyFileSync(file, path.join(dir, BACKUP))
    } catch {
      // Falhar aqui não pode impedir o app de abrir.
    }
    return resultado('ok', main.data)
  }

  // O arquivo principal está ruim: guarda uma cópia dele e da última cópia boa antes de qualquer coisa.
  let copia
  try {
    copia = copiarComDataHora(dir, file, 'notes.corrompido')
  } catch {
    return resultado('erro', null)
  }
  const backupAntigo = guardarBackupAntigo(dir)

  const doTmp = lerTmp()
  if (doTmp.ok) return resultado('recuperado', doTmp.data, { copia, backupAntigo })
  return resultado('corrompido', null, { copia, backupAntigo })
}

// Endereços de anexos (notas://anexos/...) que aparecem nas cópias guardadas: notes.corrompido-*.json e notes.backup*.json.
// A limpeza de anexos usa isso, para não apagar imagens que só essas cópias ainda usam.
const URL_ANEXO = /notas:\/\/anexos\/[^"\\\s<>]+/g
function urlsDeCopias(dir) {
  let nomes
  try {
    nomes = fs.readdirSync(dir)
  } catch {
    return []
  }
  const urls = new Set()
  for (const nome of nomes) {
    if (!/^notes\.(corrompido|backup).*\.json$/.test(nome)) continue
    let texto
    try {
      texto = fs.readFileSync(path.join(dir, nome), 'utf8')
    } catch {
      continue
    }
    for (const url of texto.match(URL_ANEXO) || []) urls.add(url)
  }
  return [...urls]
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

module.exports = { FILE, TMP, BACKUP, isValid, readNotes, saveNotes, stamp, urlsDeCopias }
