// Lógica pura das notas: sem React e sem Electron, para poder ser testada isoladamente.

export const ALL = '__all__'
export const DEFAULT_FOLDER = 'notes'
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

export function initialData(now = Date.now()) {
  return {
    folders: [{ id: DEFAULT_FOLDER, name: 'Notas' }],
    notes: [
      {
        id: uid(),
        folderId: DEFAULT_FOLDER,
        pinned: true,
        createdAt: now,
        updatedAt: now,
        html:
          '<h1>Bem-vindo ao Notas</h1><p>Um clone do Notas do Mac, feito para o Windows.</p>' +
          '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Criar o protótipo</p></li>' +
          '<li data-type="taskItem" data-checked="false"><p>Testar os atalhos: Ctrl+N, Ctrl+F, Ctrl+Shift+L</p></li></ul>',
        text: 'Bem-vindo ao Notas\nUm clone do Notas do Mac, feito para o Windows.',
      },
    ],
  }
}

// ---------- texto ----------

const lines = (text) => (text || '').split('\n').map((l) => l.trim()).filter(Boolean)

const hasImage = (html) => /<img[\s>]/.test(html || '')
const hasAttachment = (html) => /data-attachment/.test(html || '')
const hasTable = (html) => /<table[\s>]/.test(html || '')

export const titleOf = (note) => lines(note.text)[0] || (hasImage(note.html) ? 'Imagem' : 'Nova Nota')

export function previewOf(note) {
  const second = lines(note.text)[1]
  if (second) return second
  if (hasImage(note.html) && lines(note.text).length) return 'Imagem'
  return 'Nenhum texto adicional'
}

// Uma nota só conta como vazia se não tiver texto nem imagem, anexo ou tabela.
export const isBlank = (note) => !note.text.trim() && !hasImage(note.html) && !hasAttachment(note.html) && !hasTable(note.html)

export const normalize = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// ---------- datas ----------

export const DAY = 86400000
const startOfDay = (t) => new Date(new Date(t).toDateString()).getTime()
const daysAgo = (t, now) => Math.round((startOfDay(now) - startOfDay(t)) / DAY)

export function shortDate(t, now = Date.now()) {
  const days = daysAgo(t, now)
  if (days === 0) return new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return 'Ontem'
  if (days < 7) return new Date(t).toLocaleDateString('pt-BR', { weekday: 'long' })
  return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function longDate(t) {
  const d = new Date(t)
  return `${d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

export const GROUP_ORDER = ['Fixadas', 'Hoje', 'Ontem', '7 Dias Anteriores', '30 Dias Anteriores', 'Mais Antigas']

export function groupOf(note, now = Date.now()) {
  if (note.pinned) return 'Fixadas'
  const days = daysAgo(note.updatedAt, now)
  if (days === 0) return 'Hoje'
  if (days === 1) return 'Ontem'
  if (days < 7) return '7 Dias Anteriores'
  if (days < 30) return '30 Dias Anteriores'
  return 'Mais Antigas'
}

// ---------- listas e ordenação ----------

export const SORT_OPTIONS = [
  { id: 'updatedAt', label: 'Data de edição' },
  { id: 'createdAt', label: 'Data de criação' },
  { id: 'title', label: 'Título' },
]

export const DEFAULT_SORT = 'updatedAt'
export const isValidSort = (s) => SORT_OPTIONS.some((o) => o.id === s)

// Collator em português ignora acentos/maiúsculas e ordena números naturalmente ("Nota 2" antes de "Nota 10").
const titleCollator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

export function compareNotes(a, b, sortBy = DEFAULT_SORT) {
  const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
  if (pinDiff !== 0) return pinDiff
  if (sortBy === 'createdAt') return (b.createdAt || 0) - (a.createdAt || 0) || (b.updatedAt || 0) - (a.updatedAt || 0)
  if (sortBy === 'title') {
    const cmp = titleCollator.compare(titleOf(a), titleOf(b))
    return cmp !== 0 ? cmp : (b.updatedAt || 0) - (a.updatedAt || 0)
  }
  return (b.updatedAt || 0) - (a.updatedAt || 0)
}

export const sortNotes = (notes, sortBy = DEFAULT_SORT) => [...notes].sort((a, b) => compareNotes(a, b, sortBy))

const isDeleted = (n) => Boolean(n.deletedAt)

// A lixeira é uma "pasta" virtual: notas apagadas só aparecem nela, e em nenhum outro lugar.
export function filterNotes(notes, { folderId = ALL, query = '', sortBy = DEFAULT_SORT } = {}) {
  const q = normalize(query.trim())
  const filtered = notes
    .filter((n) => (folderId === TRASH ? isDeleted(n) : !isDeleted(n) && (folderId === ALL || n.folderId === folderId)))
    .filter((n) => !q || normalize(n.text).includes(q))
  return folderId === TRASH ? filtered.sort((a, b) => b.deletedAt - a.deletedAt) : sortNotes(filtered, sortBy)
}

export const countNotes = (notes, folderId) => filterNotes(notes, { folderId }).length

export function groupNotes(notes, now = Date.now(), sortBy = DEFAULT_SORT) {
  // Grupos por data (Hoje, Ontem...) só fazem sentido na ordenação por data de edição.
  // Nas outras ordenações (criação e título), fixadas ficam no topo e o resto segue em lista contínua.
  if (sortBy !== 'updatedAt') {
    if (notes.every(isDeleted)) return notes.length ? [['', notes]] : []
    const pinned = notes.filter((n) => !isDeleted(n) && n.pinned)
    const rest = notes.filter((n) => !isDeleted(n) && !n.pinned)
    const groups = []
    if (pinned.length) groups.push(['Fixadas', pinned])
    if (rest.length) groups.push([pinned.length ? 'Notas' : '', rest])
    return groups
  }
  const map = new Map()
  for (const n of notes) {
    const g = isDeleted(n) ? '' : groupOf(n, now)
    if (!map.has(g)) map.set(g, [])
    map.get(g).push(n)
  }
  // Na lixeira não há grupos por data: tudo fica num grupo sem título.
  return ['', ...GROUP_ORDER].filter((g) => map.has(g)).map((g) => [g, map.get(g)])
}

// ---------- mover e duplicar ----------

// Move uma nota ativa para outra pasta existente, sem alterar a data de edição.
export function moveNote(data, id, targetFolderId) {
  const note = data.notes.find((n) => n.id === id)
  if (!note || isDeleted(note) || note.folderId === targetFolderId) return data
  if (!data.folders.some((f) => f.id === targetFolderId)) return data
  return patchNote(data, id, { folderId: targetFolderId })
}

// Cria uma cópia da nota na mesma pasta com novo id e datas atuais.
// Anexos e imagens são apenas endereços notas://anexos/..., então nada precisa ser copiado no disco.
export function duplicateNote(data, id, now = Date.now(), newId = uid()) {
  const source = data.notes.find((n) => n.id === id)
  if (!source || isDeleted(source)) return { data, note: null }
  const copy = {
    id: newId,
    folderId: source.folderId,
    pinned: false,
    createdAt: now,
    updatedAt: now,
    html: source.html,
    text: source.text,
  }
  return { data: { ...data, notes: [...data.notes, copy] }, note: copy }
}

// ---------- lixeira ("Apagadas Recentemente") ----------

export const TRASH = '__trash__'
export const TRASH_DAYS = 30

const patchNote = (data, id, patch) => ({ ...data, notes: data.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) })

export const moveToTrash = (data, id, now = Date.now()) => patchNote(data, id, { deletedAt: now, pinned: false })

// Recuperar devolve a nota para a pasta de origem; se essa pasta não existe mais, vai para "Notas".
export function restoreNote(data, id) {
  const note = data.notes.find((n) => n.id === id)
  const folderExists = data.folders.some((f) => f.id === note?.folderId)
  return patchNote(data, id, { deletedAt: null, folderId: folderExists ? note.folderId : DEFAULT_FOLDER })
}

export const deleteForever = (data, id) => ({ ...data, notes: data.notes.filter((n) => n.id !== id) })

export const emptyTrash = (data) => ({ ...data, notes: data.notes.filter((n) => !isDeleted(n)) })

// Notas apagadas há mais de 30 dias somem de vez.
export function purgeTrash(data, now = Date.now()) {
  const limit = now - TRASH_DAYS * DAY
  const notes = data.notes.filter((n) => !isDeleted(n) || n.deletedAt > limit)
  return notes.length === data.notes.length ? data : { ...data, notes }
}

export const daysLeft = (note, now = Date.now()) => Math.max(0, TRASH_DAYS - Math.floor((now - note.deletedAt) / DAY))

// Endereços dos anexos (imagens e arquivos) usados em todas as notas, inclusive as que estão no lixo.
export function attachmentUrls(notes) {
  const urls = new Set()
  for (const n of notes) for (const m of (n.html || '').matchAll(/notas:\/\/anexos\/[^"'\s)<>]+/g)) urls.add(m[0])
  return [...urls]
}

// ---------- importar (arquivo .notas) ----------

// Último momento em que a nota mudou: editar muda o updatedAt; mandar para o lixo, o deletedAt.
const lastChange = (n) => Math.max(n.updatedAt || 0, n.deletedAt || 0)

// Junta as notas de um backup com as atuais, sem perder nada:
// - nota que não existe aqui entra; se a mesma nota existe dos dois lados, fica a que mudou por último;
// - pasta com o mesmo id ou o mesmo nome vira uma só; nota cuja pasta não existe vai para "Notas".
export function mergeData(current, imported) {
  const folders = [...current.folders]
  const folderIds = new Map() // id da pasta no backup → id da pasta aqui
  for (const f of imported.folders) {
    const same = folders.find((x) => x.id === f.id) || folders.find((x) => normalize(x.name.trim()) === normalize(String(f.name).trim()))
    if (same) folderIds.set(f.id, same.id)
    else {
      folders.push({ id: f.id, name: f.name })
      folderIds.set(f.id, f.id)
    }
  }

  const notes = new Map(current.notes.map((n) => [n.id, n]))
  let added = 0
  let updated = 0
  for (const n of imported.notes) {
    if (typeof n?.id !== 'string' || typeof n.text !== 'string') continue
    const note = { ...n, html: n.html || '', folderId: folderIds.get(n.folderId) ?? DEFAULT_FOLDER }
    const existing = notes.get(n.id)
    if (!existing) added++
    else if (lastChange(note) > lastChange(existing)) updated++
    else continue
    notes.set(n.id, note)
  }
  return { data: { folders, notes: [...notes.values()] }, added, updated }
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

export function importMessage({ added, updated }) {
  if (!added && !updated) return 'Nenhuma novidade: todas as notas desse arquivo já estavam aqui.'
  const parts = []
  if (added) parts.push(plural(added, 'nota nova', 'notas novas'))
  if (updated) parts.push(plural(updated, 'nota atualizada', 'notas atualizadas'))
  return `Importação concluída: ${parts.join(' e ')}.`
}

// Apagar uma pasta move as notas dela para a pasta padrão, que nunca é apagada.
export function removeFolder(data, folderId) {
  if (folderId === DEFAULT_FOLDER) return data
  return {
    folders: data.folders.filter((f) => f.id !== folderId),
    notes: data.notes.map((n) => (n.folderId === folderId ? { ...n, folderId: DEFAULT_FOLDER } : n)),
  }
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

// ---------- navegação rápida (Ctrl+P) e histórico (Alt+← / Alt+→) ----------

export function quickOpenNotes(notes, folders, query = '') {
  const folderNames = new Map(folders.map((f) => [f.id, f.name]))
  const active = notes.filter((n) => !isDeleted(n))
  const q = normalize(query.trim())

  if (!q) {
    return active
      .slice()
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
      .map((n) => ({ note: n, folderName: folderNames.get(n.folderId) || '' }))
  }

  const scored = []
  for (const n of active) {
    const folderName = folderNames.get(n.folderId) || ''
    const title = normalize(titleOf(n))
    const text = normalize(n.text)
    const folder = normalize(folderName)
    let score = 0
    if (title.startsWith(q)) score = 3
    else if (title.includes(q)) score = 2
    else if (text.includes(q) || folder.includes(q)) score = 1
    if (score > 0) scored.push({ note: n, folderName, score })
  }

  return scored
    .sort((a, b) => b.score - a.score || b.note.updatedAt - a.note.updatedAt)
    .map(({ note, folderName }) => ({ note, folderName }))
}

export function pushNavHistory(history, noteId) {
  if (!noteId) return history
  if (history.stack[history.index] === noteId) return history
  const nextStack = [...history.stack.slice(0, history.index + 1), noteId].slice(-50)
  return { stack: nextStack, index: nextStack.length - 1 }
}

export function stepNavHistory(history, delta, validNoteIds) {
  const step = delta < 0 ? -1 : 1
  let idx = history.index + step
  while (idx >= 0 && idx < history.stack.length) {
    const id = history.stack[idx]
    if (validNoteIds.has(id)) {
      return { history: { stack: history.stack, index: idx }, noteId: id }
    }
    idx += step
  }
  return null
}
