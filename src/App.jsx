import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { buildExtensions, nodeForAttachment } from './editor/extensions.js'
import { initialUpdate, updateReducer, showUpdateModal, showUpdateButton } from './updates.js'
import appIcon from '../build/icon.png'
import {
  ALL,
  DEFAULT_FOLDER,
  uid,
  initialData,
  titleOf,
  previewOf,
  isBlank,
  shortDate,
  longDate,
  filterNotes,
  groupNotes,
  removeFolder,
} from './notes.js'

// ---------- ícones ----------

const ICONS = {
  compose: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  pin: 'M9 4h6l-1 6 3 3H7l3-3-1-6zM12 13v7',
  check: 'M4 6h2M4 12h2M4 18h2M9 6h11M9 12h11M9 18h11',
  table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
  clip: 'M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17a1.7 1.7 0 0 1-2.4-2.4L15 7',
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

// Salva cada arquivo como anexo e insere na nota: imagens aparecem inline, o resto vira um cartão.
async function insertFiles(editor, files, pos) {
  const nodes = []
  for (const file of files) {
    const saved = await window.notesApi.saveAttachment({ name: file.name || 'imagem.png', type: file.type, bytes: await file.arrayBuffer() })
    nodes.push(nodeForAttachment(saved))
  }
  if (!nodes.length || editor.isDestroyed) return
  editor.chain().insertContentAt(pos ?? editor.state.selection.to, nodes).focus().run()
}

// Fecha um menu suspenso ao clicar fora dele.
function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])
  return { open, setOpen, ref }
}

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
  const { open, setOpen, ref } = usePopover()

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

const TABLE_ACTIONS = [
  { label: 'Adicionar linha acima', run: (c) => c.addRowBefore() },
  { label: 'Adicionar linha abaixo', run: (c) => c.addRowAfter() },
  { label: 'Adicionar coluna à esquerda', run: (c) => c.addColumnBefore() },
  { label: 'Adicionar coluna à direita', run: (c) => c.addColumnAfter() },
  { label: 'Apagar linha', run: (c) => c.deleteRow(), danger: true },
  { label: 'Apagar coluna', run: (c) => c.deleteColumn(), danger: true },
  { label: 'Apagar tabela', run: (c) => c.deleteTable(), danger: true },
]

// Fora de uma tabela, o botão insere uma tabela 3×3. Dentro dela, abre as opções de linhas e colunas.
function TableMenu({ editor }) {
  const { open, setOpen, ref } = usePopover()
  const inTable = editor.isActive('table')

  return (
    <div className="format-menu" ref={ref}>
      <button
        className={`tool ${inTable ? 'on' : ''}`}
        title={inTable ? 'Opções da tabela' : 'Inserir tabela'}
        onClick={() => (inTable ? setOpen(!open) : editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run())}
      >
        <Icon name="table" />
      </button>
      {open && inTable && (
        <div className="popover">
          {TABLE_ACTIONS.map((a) => (
            <button
              key={a.label}
              className={`fmt ${a.danger ? 'danger' : ''}`}
              onClick={() => {
                a.run(editor.chain().focus()).run()
                setOpen(false)
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function NoteEditor({ note, onChange, onTogglePin, editorRef }) {
  const fileInput = useRef(null)
  const editor = useEditor({
    extensions: buildExtensions({ onFiles: insertFiles }),
    content: note.html,
    autofocus: isBlank(note) ? 'start' : false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      // Duplo clique num anexo abre o arquivo no programa padrão do Windows.
      handleDoubleClickOn: (_view, _pos, node) => {
        if (node.type.name !== 'attachment') return false
        window.notesApi.openAttachment(node.attrs.src)
        return true
      },
    },
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
          <TableMenu editor={editor} />
          <button className="tool" title="Anexar imagem ou arquivo" onClick={() => fileInput.current.click()}>
            <Icon name="clip" />
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              insertFiles(editor, [...e.target.files])
              e.target.value = ''
            }}
          />
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

// ---------- atualização ----------

function UpdateModal({ update, currentVersion, onAccept, onDismiss, onClose }) {
  const { phase, version, percent, error } = update
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-labelledby="update-title">
        <img className="modal-icon" src={appIcon} alt="" />
        {phase === 'available' && (
          <>
            <h2 id="update-title">Nova versão disponível</h2>
            <p>
              O Notas {version} está disponível. Você está usando a versão {currentVersion}.
              <br />
              Ao atualizar, o app fecha e abre de novo sozinho.
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={onDismiss}>
                Agora não
              </button>
              <button className="btn primary" autoFocus onClick={onAccept}>
                Atualizar
              </button>
            </div>
          </>
        )}
        {phase === 'downloading' && (
          <>
            <h2 id="update-title">Baixando o Notas {version}…</h2>
            <div className="progress">
              <div style={{ width: `${percent}%` }} />
            </div>
            <p className="muted">{percent}%</p>
          </>
        )}
        {phase === 'installing' && (
          <>
            <h2 id="update-title">Instalando…</h2>
            <p className="muted">O Notas vai fechar e abrir de novo em alguns segundos.</p>
          </>
        )}
        {phase === 'error' && (
          <>
            <h2 id="update-title">Não foi possível atualizar</h2>
            <p className="muted">{error}</p>
            <div className="modal-actions">
              <button className="btn" onClick={onClose}>
                Fechar
              </button>
              <button className="btn primary" onClick={onAccept}>
                Tentar de novo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
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
  const [update, dispatchUpdate] = useReducer(updateReducer, initialUpdate)
  const [currentVersion, setCurrentVersion] = useState('')
  const searchRef = useRef(null)
  const editorRef = useRef(null)
  const dataRef = useRef(null)
  dataRef.current = data

  // carregar e salvar
  useEffect(() => {
    window.notesApi.load().then((d) => {
      const loaded = d || initialData()
      setData(loaded)
      const first = [...loaded.notes].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      setNoteId(first?.id ?? null)
    })
    window.notesApi.version().then(setCurrentVersion)
    const unsubscribe = window.notesApi.onUpdate(dispatchUpdate)
    // A verificação pode ter terminado antes da interface abrir.
    window.notesApi.getUpdate().then((event) => event && dispatchUpdate(event))
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!data) return
    const t = setTimeout(() => window.notesApi.save(data), 300)
    return () => clearTimeout(t)
  }, [data])

  const startUpdate = () => {
    dispatchUpdate({ type: 'start' })
    window.notesApi.downloadUpdate().catch((err) => dispatchUpdate({ type: 'error', message: err.message }))
  }

  // Assim que o download termina: salva na hora (para não perder o que foi digitado nos últimos 300 ms),
  // e o app fecha, instala e abre de novo sozinho.
  useEffect(() => {
    if (update.phase !== 'installing') return
    window.notesApi
      .save(dataRef.current)
      .then(() => window.notesApi.installUpdate())
      .catch((err) => dispatchUpdate({ type: 'error', message: err.message }))
  }, [update.phase])

  const note = data?.notes.find((n) => n.id === noteId)
  const visibleNotes = useMemo(() => (data ? filterNotes(data.notes, { folderId, query }) : []), [data, folderId, query])
  const grouped = useMemo(() => groupNotes(visibleNotes), [visibleNotes])

  // Como no Mac: uma nota vazia some quando você sai dela.
  const selectNote = useCallback(
    (id) => {
      setData((d) => {
        const cur = d.notes.find((n) => n.id === noteId)
        if (cur && cur.id !== id && isBlank(cur)) return { ...d, notes: d.notes.filter((n) => n.id !== cur.id) }
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
    setData((d) => ({ ...d, notes: [...d.notes.filter((x) => !isBlank(x) || x.id !== noteId), n] }))
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
    setData((d) => removeFolder(d, f.id))
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

      {/* Fica no topo, ao lado dos botões da janela, enquanto houver versão nova não instalada. */}
      {showUpdateButton(update) && (
        <button className="update-button" title={`Atualizar para a versão ${update.version}`} onClick={startUpdate}>
          Atualizar
        </button>
      )}
      {showUpdateModal(update) && (
        <UpdateModal
          update={update}
          currentVersion={currentVersion}
          onAccept={startUpdate}
          onDismiss={() => dispatchUpdate({ type: 'dismiss' })}
          onClose={() => dispatchUpdate({ type: 'close' })}
        />
      )}
    </div>
  )
}
