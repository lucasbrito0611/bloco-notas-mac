import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'

const ALL = '__all__'
const DEFAULT_FOLDER = 'notes'
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

function initialData() {
  const now = Date.now()
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

// ---------- texto e datas ----------

const lines = (text) => (text || '').split('\n').map((l) => l.trim()).filter(Boolean)
const titleOf = (note) => lines(note.text)[0] || 'Nova Nota'
const previewOf = (note) => lines(note.text)[1] || 'Nenhum texto adicional'
const normalize = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const DAY = 86400000
const startOfDay = (t) => new Date(new Date(t).toDateString()).getTime()

function shortDate(t) {
  const diff = startOfDay(Date.now()) - startOfDay(t)
  if (diff === 0) return new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (diff === DAY) return 'Ontem'
  if (diff < 7 * DAY) return new Date(t).toLocaleDateString('pt-BR', { weekday: 'long' })
  return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function longDate(t) {
  const d = new Date(t)
  return `${d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

function groupOf(note) {
  if (note.pinned) return 'Fixadas'
  const diff = startOfDay(Date.now()) - startOfDay(note.updatedAt)
  if (diff === 0) return 'Hoje'
  if (diff === DAY) return 'Ontem'
  if (diff < 7 * DAY) return '7 Dias Anteriores'
  if (diff < 30 * DAY) return '30 Dias Anteriores'
  return 'Mais Antigas'
}
const GROUP_ORDER = ['Fixadas', 'Hoje', 'Ontem', '7 Dias Anteriores', '30 Dias Anteriores', 'Mais Antigas']

// ---------- ícones ----------

const ICONS = {
  compose: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  pin: 'M9 4h6l-1 6 3 3H7l3-3-1-6zM12 13v7',
  check: 'M4 6h2M4 12h2M4 18h2M9 6h11M9 12h11M9 18h11',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  newFolder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 10v6M9 13h6',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  sidebar: 'M4 5h16v14H4zM9 5v14',
}

function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name]} />
    </svg>
  )
}

// ---------- editor ----------

const FORMATS = [
  { label: 'Título', cls: 'fmt-h1', run: (c) => c.setHeading({ level: 1 }), active: (e) => e.isActive('heading', { level: 1 }) },
  { label: 'Cabeçalho', cls: 'fmt-h2', run: (c) => c.setHeading({ level: 2 }), active: (e) => e.isActive('heading', { level: 2 }) },
  { label: 'Subcabeçalho', cls: 'fmt-h3', run: (c) => c.setHeading({ level: 3 }), active: (e) => e.isActive('heading', { level: 3 }) },
  { label: 'Corpo', cls: '', run: (c) => c.setParagraph(), active: (e) => e.isActive('paragraph') },
  { label: 'Monoespaçado', cls: 'fmt-mono', run: (c) => c.toggleCodeBlock(), active: (e) => e.isActive('codeBlock') },
  { label: '• Lista com marcadores', cls: '', run: (c) => c.toggleBulletList(), active: (e) => e.isActive('bulletList') },
  { label: '1. Lista numerada', cls: '', run: (c) => c.toggleOrderedList(), active: (e) => e.isActive('orderedList') },
]

function FormatMenu({ editor }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const mark = (name, label, cls) => (
    <button className={`mark-btn ${cls} ${editor.isActive(name) ? 'on' : ''}`} onClick={() => editor.chain().focus().toggleMark(name).run()}>
      {label}
    </button>
  )

  return (
    <div className="format-menu" ref={ref}>
      <button className={`tool ${open ? 'on' : ''}`} title="Formatar" onClick={() => setOpen(!open)}>
        <span className="aa">Aa</span>
      </button>
      {open && (
        <div className="popover">
          <div className="marks">
            {mark('bold', 'N', 'b')}
            {mark('italic', 'I', 'i')}
            {mark('underline', 'S', 'u')}
            {mark('strike', 'S', 's')}
          </div>
          {FORMATS.map((f) => (
            <button
              key={f.label}
              className={`fmt ${f.cls} ${f.active(editor) ? 'on' : ''}`}
              onClick={() => {
                f.run(editor.chain().focus()).run()
                setOpen(false)
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function NoteEditor({ note, onChange, onTogglePin, editorRef }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: ({ pos }) => (pos === 0 ? 'Título' : '') }),
    ],
    content: note.html,
    autofocus: note.text.trim() ? false : 'start',
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor }) => onChange(editor.getHTML(), editor.getText({ blockSeparator: '\n' })),
  })

  useEffect(() => {
    editorRef.current = editor
    return () => (editorRef.current = null)
  }, [editor, editorRef])

  if (!editor) return null
  return (
    <>
      <header className="editor-bar drag">
        <div className="tools no-drag">
          <FormatMenu editor={editor} />
          <button
            className={`tool ${editor.isActive('taskList') ? 'on' : ''}`}
            title="Lista de verificação (Ctrl+Shift+L)"
            onClick={() => editor.chain().focus().toggleTaskList().run()}
          >
            <Icon name="check" />
          </button>
          <button className={`tool ${note.pinned ? 'on' : ''}`} title={note.pinned ? 'Desafixar nota' : 'Fixar nota'} onClick={onTogglePin}>
            <Icon name="pin" />
          </button>
        </div>
      </header>
      <div className="editor-scroll" onMouseDown={(e) => e.target === e.currentTarget && editor.commands.focus('end')}>
        <div className="note-date">{longDate(note.updatedAt)}</div>
        <EditorContent editor={editor} className="editor" />
      </div>
    </>
  )
}

// ---------- app ----------

export default function App() {
  const [data, setData] = useState(null)
  const [folderId, setFolderId] = useState(ALL)
  const [noteId, setNoteId] = useState(null)
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const searchRef = useRef(null)
  const editorRef = useRef(null)

  // carregar e salvar
  useEffect(() => {
    window.notesApi.load().then((d) => {
      const loaded = d || initialData()
      setData(loaded)
      const first = [...loaded.notes].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      setNoteId(first?.id ?? null)
    })
  }, [])

  useEffect(() => {
    if (!data) return
    const t = setTimeout(() => window.notesApi.save(data), 300)
    return () => clearTimeout(t)
  }, [data])

  const note = data?.notes.find((n) => n.id === noteId)

  const visibleNotes = useMemo(() => {
    if (!data) return []
    const q = normalize(query.trim())
    return data.notes
      .filter((n) => folderId === ALL || n.folderId === folderId)
      .filter((n) => !q || normalize(n.text).includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [data, folderId, query])

  const grouped = useMemo(() => {
    const map = new Map()
    for (const n of visibleNotes) {
      const g = groupOf(n)
      if (!map.has(g)) map.set(g, [])
      map.get(g).push(n)
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => [g, map.get(g)])
  }, [visibleNotes])

  // Como no Mac: uma nota vazia some quando você sai dela.
  const selectNote = useCallback(
    (id) => {
      setData((d) => {
        const cur = d.notes.find((n) => n.id === noteId)
        if (cur && cur.id !== id && !cur.text.trim()) return { ...d, notes: d.notes.filter((n) => n.id !== cur.id) }
        return d
      })
      setNoteId(id)
    },
    [noteId],
  )

  const newNote = useCallback(() => {
    const now = Date.now()
    const n = { id: uid(), folderId: folderId === ALL ? DEFAULT_FOLDER : folderId, pinned: false, createdAt: now, updatedAt: now, html: '', text: '' }
    setQuery('')
    setData((d) => ({ ...d, notes: [...d.notes.filter((x) => x.text.trim() || x.id !== noteId), n] }))
    setNoteId(n.id)
  }, [folderId, noteId])

  const updateNote = useCallback((id, patch) => {
    setData((d) => ({ ...d, notes: d.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }))
  }, [])

  const deleteNote = useCallback(() => {
    if (!note) return
    const idx = visibleNotes.findIndex((n) => n.id === note.id)
    const next = visibleNotes[idx + 1] || visibleNotes[idx - 1]
    setData((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== note.id) }))
    setNoteId(next?.id ?? null)
  }, [note, visibleNotes])

  const newFolder = useCallback(() => {
    const f = { id: uid(), name: 'Nova Pasta' }
    setData((d) => ({ ...d, folders: [...d.folders, f] }))
    setFolderId(f.id)
    setRenaming(f.id)
    setSidebarOpen(true)
  }, [])

  const deleteFolder = (f) => {
    if (!confirm(`Apagar a pasta "${f.name}"? As notas dela vão para "Notas".`)) return
    setData((d) => ({
      folders: d.folders.filter((x) => x.id !== f.id),
      notes: d.notes.map((n) => (n.folderId === f.id ? { ...n, folderId: DEFAULT_FOLDER } : n)),
    }))
    if (folderId === f.id) setFolderId(ALL)
  }

  // atalhos
  useEffect(() => {
    const onKey = (e) => {
      if (!e.ctrlKey) return
      const k = e.key.toLowerCase()
      if (k === 'n' && e.shiftKey) newFolder()
      else if (k === 'n') newNote()
      else if (k === 'f') searchRef.current?.focus()
      else if (k === 'l' && e.shiftKey) editorRef.current?.chain().focus().toggleTaskList().run()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [newNote, newFolder])

  if (!data) return null

  const count = (id) => data.notes.filter((n) => id === ALL || n.folderId === id).length
  const folderRow = (f, removable) => (
    <div
      key={f.id}
      className={`folder ${folderId === f.id ? 'sel' : ''}`}
      onClick={() => setFolderId(f.id)}
      onDoubleClick={() => f.id !== ALL && setRenaming(f.id)}
    >
      <Icon name="folder" size={17} />
      {renaming === f.id ? (
        <input
          autoFocus
          defaultValue={f.name}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => {
            const name = e.target.value.trim() || f.name
            setData((d) => ({ ...d, folders: d.folders.map((x) => (x.id === f.id ? { ...x, name } : x)) }))
            setRenaming(null)
          }}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && e.target.blur()}
        />
      ) : (
        <span className="name">{f.name}</span>
      )}
      {removable && (
        <button className="folder-del" title="Apagar pasta" onClick={(e) => (e.stopPropagation(), deleteFolder(f))}>
          <Icon name="trash" size={14} />
        </button>
      )}
      <span className="count">{count(f.id)}</span>
    </div>
  )

  return (
    <div className={`app ${sidebarOpen ? '' : 'no-sidebar'}`}>
      {sidebarOpen && (
        <aside className="sidebar">
          <div className="sidebar-top drag" />
          <div className="section-label">No Computador</div>
          {folderRow({ id: ALL, name: 'Todas as Notas' }, false)}
          {data.folders.map((f) => folderRow(f, f.id !== DEFAULT_FOLDER))}
          <button className="new-folder" onClick={newFolder}>
            <Icon name="newFolder" size={17} /> Nova Pasta
          </button>
        </aside>
      )}

      <section className="list">
        <header className="list-bar drag">
          <div className="tools no-drag">
            <button className="tool" title="Mostrar/ocultar pastas" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <Icon name="sidebar" />
            </button>
          </div>
          <div className="tools no-drag">
            <button className="tool" title="Apagar nota" onClick={deleteNote} disabled={!note}>
              <Icon name="trash" />
            </button>
            <button className="tool" title="Nova nota (Ctrl+N)" onClick={newNote}>
              <Icon name="compose" />
            </button>
          </div>
        </header>
        <div className="search">
          <Icon name="search" size={15} />
          <input ref={searchRef} placeholder="Buscar" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQuery('')} />
        </div>
        <div className="notes">
          {grouped.map(([group, notes]) => (
            <div key={group}>
              <div className="group-label">{group}</div>
              {notes.map((n) => (
                <div key={n.id} className={`note-item ${n.id === noteId ? 'sel' : ''}`} onClick={() => selectNote(n.id)}>
                  <div className="note-title">{titleOf(n)}</div>
                  <div className="note-sub">
                    <span className="note-time">{shortDate(n.updatedAt)}</span>
                    <span className="note-preview">{previewOf(n)}</span>
                  </div>
                  {folderId === ALL && data.folders.length > 1 && (
                    <div className="note-folder">
                      <Icon name="folder" size={12} /> {data.folders.find((f) => f.id === n.folderId)?.name}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
          {!visibleNotes.length && <div className="empty">{query ? 'Nenhum resultado' : 'Nenhuma nota'}</div>}
        </div>
      </section>

      <main className="editor-pane">
        {note ? (
          <NoteEditor
            key={note.id}
            note={note}
            editorRef={editorRef}
            onChange={(html, text) => updateNote(note.id, { html, text, updatedAt: Date.now() })}
            onTogglePin={() => updateNote(note.id, { pinned: !note.pinned })}
          />
        ) : (
          <>
            <header className="editor-bar drag" />
            <div className="no-note">Nenhuma nota selecionada</div>
          </>
        )}
      </main>
    </div>
  )
}
