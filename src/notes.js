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

// ---------- listas ----------

export function filterNotes(notes, { folderId = ALL, query = '' } = {}) {
  const q = normalize(query.trim())
  return notes
    .filter((n) => folderId === ALL || n.folderId === folderId)
    .filter((n) => !q || normalize(n.text).includes(q))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function groupNotes(notes, now = Date.now()) {
  const map = new Map()
  for (const n of notes) {
    const g = groupOf(n, now)
    if (!map.has(g)) map.set(g, [])
    map.get(g).push(n)
  }
  return GROUP_ORDER.filter((g) => map.has(g)).map((g) => [g, map.get(g)])
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
