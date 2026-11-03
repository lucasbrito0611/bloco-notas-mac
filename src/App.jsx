import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { buildExtensions, nodeForAttachment } from './editor/extensions.js'
import { initialUpdate, updateReducer, showUpdateModal, showUpdateButton } from './updates.js'
import { useListMotion, collapse } from './motion.js'
import { CHANGELOG, newsSince } from './changelog.js'
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
  TRASH,
  TRASH_DAYS,
  countNotes,
  moveToTrash,
  restoreNote,
  deleteForever,
  emptyTrash,
  purgeTrash,
  daysLeft,
  attachmentUrls,
  mergeData,
  importMessage,
} from './notes.js'

// ---------- ícones ----------

// Desenhos da Lucide (lucide.dev, licença ISC), de traço fino e arredondado como os ícones do Mac.
// Os da Apple (SF Symbols) não podem ser copiados. O "check" foi desenhado aqui, com bolinhas como no Notas.
const ICONS = {
  compose:
    'M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.4 2.6a1 1 0 0 1 3 3l-9 9a2 2 0 0 1-.85.5l-2.87.84a.5.5 0 0 1-.62-.62l.84-2.87a2 2 0 0 1 .5-.85z',
  trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6',
  pin: 'M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z',
  check: 'M2.5 7a3 3 0 1 0 6 0 3 3 0 1 0-6 0M4.2 7.1l1 1 1.9-2.1M2.5 17a3 3 0 1 0 6 0 3 3 0 1 0-6 0M12 7h9M12 17h9',
  table: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM3 9h18M3 15h18M9 3v18M15 3v18',
  clip: 'M13.23 20.25 21 12.3M16 6l-8.41 8.59a2 2 0 0 0 2.82 2.82l8.42-8.58a4 4 0 0 0-5.66-5.66l-8.42 8.58a6 6 0 1 0 8.49 8.49',
  folder: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z',
  newFolder:
    'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2zM12 10v6M9 13h6',
  search: 'M21 21l-4.34-4.34M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
  sidebar: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 3v18',
  export: 'M12 3v12M17 8l-5-5-5 5M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4',
  import: 'M12 15V3M7 10l5 5 5-5M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4',
}

function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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

// end (a busca) fica na mesma barra da formatação.
function NoteEditor({ note, onChange, onTogglePin, onRestore, editorRef, end }) {
  const fileInput = useRef(null)
  const inTrash = Boolean(note.deletedAt)
  const editor = useEditor({
    extensions: buildExtensions({ onFiles: insertFiles }),
    content: note.html,
    // Nota no lixo é só para leitura: para editar, primeiro recupere.
    editable: !inTrash,
    autofocus: !inTrash && isBlank(note) ? 'start' : false,
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

  // O false evita o evento "update": sem ele, só abrir a nota mudaria a data de edição dela.
  useEffect(() => {
    editor?.setEditable(!inTrash, false)
  }, [editor, inTrash])

  if (!editor) return null
  if (inTrash) {
    return (
      <>
        <header className="editor-bar drag">{end}</header>
        <div className="trash-banner">
          <span>
            Esta nota está em Apagadas Recentemente e será apagada de vez em {daysLeft(note)} {daysLeft(note) === 1 ? 'dia' : 'dias'}.
          </span>
          <button className="btn primary" onClick={onRestore}>
            Recuperar
          </button>
        </div>
        <div className="editor-scroll">
          <div className="note-date">{longDate(note.updatedAt)}</div>
          <EditorContent editor={editor} className="editor" />
        </div>
      </>
    )
  }
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
        {end}
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

// ---------- novidades ----------

// Histórico até a versão instalada (a entrada da próxima versão pode já estar escrita no código).
// Fora do app, sem número de versão, mostra tudo.
const allNews = (version) => {
  const entries = newsSince(CHANGELOG, '0.0.0', version)
  return entries.length ? entries : CHANGELOG
}

// Aparece sozinha depois de uma atualização, com o que mudou desde a última versão aberta.
// O link "Novidades" na barra lateral abre a mesma janela com o histórico inteiro.
function NewsModal({ entries, title, onClose }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal news" role="dialog" aria-labelledby="news-title" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <img className="modal-icon" src={appIcon} alt="" />
        <h2 id="news-title">{title}</h2>
        <div className="news-list">
          {entries.map((e) => (
            <section key={e.version}>
              {entries.length > 1 && <h3>Versão {e.version}</h3>}
              <ul>
                {e.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn primary" autoFocus onClick={onClose}>
            Continuar
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------- app ----------

// O Electron embrulha os erros do processo principal ("Error invoking remote method..."); fica só a mensagem.
const ipcError = (err) => String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export default function App() {
  const [data, setData] = useState(null)
  const [folderId, setFolderId] = useState(ALL)
  const [noteId, setNoteId] = useState(null)
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState(null)
  // Como no Mac, as pastas começam escondidas e o app lembra se você deixou a barra aberta.
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('barraLateralAberta') === 'sim')
  const [update, dispatchUpdate] = useReducer(updateReducer, initialUpdate)
  const [currentVersion, setCurrentVersion] = useState('')
  // Janela de novidades: { title, entries } quando aberta.
  const [news, setNews] = useState(null)
  // Muda a cada importação, para o editor recarregar a nota aberta se ela veio atualizada no arquivo.
  const [imports, setImports] = useState(0)
  const searchRef = useRef(null)
  const editorRef = useRef(null)
  const listRef = useRef(null)
  // Enquanto a nota apagada está recolhendo, ignora novos cliques na lixeira.
  const deletingRef = useRef(false)
  const dataRef = useRef(null)
  dataRef.current = data

  // carregar e salvar
  useEffect(() => {
    window.notesApi.load().then((d) => {
      // Ao abrir: some com o que está no lixo há mais de 30 dias e com os anexos que ninguém usa mais.
      const loaded = purgeTrash(d || initialData())
      setData(loaded)
      setNoteId(filterNotes(loaded.notes)[0]?.id ?? null)
      window.notesApi.cleanupAttachments(attachmentUrls(loaded.notes))
    })
    window.notesApi.version().then((version) => {
      setCurrentVersion(version)
      // Compara com a última versão aberta (guardada no localStorage, que o Electron salva na pasta do app
      // em %APPDATA%) para mostrar as novidades só uma vez, logo depois de atualizar.
      const entries = newsSince(CHANGELOG, localStorage.getItem('ultimaVersaoAberta'), version)
      localStorage.setItem('ultimaVersaoAberta', version)
      if (entries.length) setNews({ title: `Novidades do Notas ${version}`, entries })
    })
    const unsubscribe = window.notesApi.onUpdate(dispatchUpdate)
    // A verificação pode ter terminado antes da interface abrir.
    window.notesApi.getUpdate().then((event) => event && dispatchUpdate(event))
    return unsubscribe
  }, [])

  useEffect(() => {
    localStorage.setItem('barraLateralAberta', sidebarOpen ? 'sim' : 'nao')
  }, [sidebarOpen])

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
    const target = folderId === ALL || folderId === TRASH ? DEFAULT_FOLDER : folderId
    const n = { id: uid(), folderId: target, pinned: false, createdAt: now, updatedAt: now, html: '', text: '' }
    if (folderId === TRASH) setFolderId(ALL)
    setQuery('')
    setData((d) => ({ ...d, notes: [...d.notes.filter((x) => !isBlank(x) || x.id !== noteId), n] }))
    setNoteId(n.id)
  }, [folderId, noteId])

  const updateNote = useCallback((id, patch) => {
    setData((d) => ({ ...d, notes: d.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }))
  }, [])

  // Depois de apagar algo de vez, tira do disco os anexos que ficaram sem nota.
  const removeForever = useCallback((change) => {
    setData((d) => {
      const next = change(d)
      window.notesApi.cleanupAttachments(attachmentUrls(next.notes))
      return next
    })
  }, [])

  // Fora do lixo, apagar manda a nota para "Apagadas Recentemente". Dentro dele, apaga de vez.
  // Primeiro a nota recolhe na lista; só depois sai dos dados.
  const deleteNote = useCallback(() => {
    if (!note || deletingRef.current) return
    if (note.deletedAt && !confirm(`Apagar "${titleOf(note)}" permanentemente? Essa ação não pode ser desfeita.`)) return
    const { id, deletedAt } = note
    const idx = visibleNotes.findIndex((n) => n.id === id)
    const nextId = (visibleNotes[idx + 1] || visibleNotes[idx - 1])?.id ?? null
    // Se for a única nota do grupo ("Hoje", "Ontem"...), recolhe o grupo inteiro, com o título junto.
    const row = listRef.current?.querySelector(`[data-flip="${CSS.escape(id)}"]`)
    const group = row?.parentElement
    deletingRef.current = true
    collapse(group?.querySelectorAll('.note-item').length === 1 ? group : row).then(() => {
      deletingRef.current = false
      if (deletedAt) removeForever((d) => deleteForever(d, id))
      else setData((d) => moveToTrash(d, id))
      // Se a pessoa clicou em outra nota durante a animação, fica nela.
      setNoteId((cur) => (cur === id ? nextId : cur))
    })
  }, [note, visibleNotes, removeForever])

  const restore = (id) => {
    setData((d) => restoreNote(d, id))
    setFolderId(ALL)
  }

  const clearTrash = () => {
    const total = countNotes(data.notes, TRASH)
    if (!confirm(`Apagar ${total === 1 ? 'a nota' : `as ${total} notas`} de Apagadas Recentemente permanentemente? Essa ação não pode ser desfeita.`)) return
    removeForever(emptyTrash)
    setFolderId(ALL)
    setNoteId(filterNotes(data.notes)[0]?.id ?? null)
  }

  const exportAll = async () => {
    try {
      await window.notesApi.exportNotes(dataRef.current, attachmentUrls(dataRef.current.notes))
    } catch (err) {
      alert(`Não foi possível exportar as notas.\n\n${ipcError(err)}`)
    }
  }

  // Junta as notas do arquivo com as atuais (veja mergeData); o salvamento automático grava o resultado.
  const importAll = async () => {
    let imported
    try {
      imported = await window.notesApi.importNotes()
    } catch (err) {
      alert(`Não foi possível importar as notas.\n\n${ipcError(err)}`)
      return
    }
    if (!imported) return
    const result = mergeData(dataRef.current, imported)
    const next = purgeTrash(result.data)
    setData(next)
    setImports((n) => n + 1)
    setNoteId((id) => id ?? filterNotes(next.notes)[0]?.id ?? null)
    alert(importMessage(result))
  }

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

  // Anima a lista quando notas mudam de lugar (fixar, editar, apagar). Trocar de pasta ou buscar não anima.
  useListMotion(listRef, `${folderId}|${query}`)

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

  const count = (id) => countNotes(data.notes, id)
  const trashCount = count(TRASH)
  const inTrashFolder = folderId === TRASH
  // Apagar e nova nota ficam em cima da lista; a busca fica no meio da barra do editor.
  const noteActions = (
    <div className="tools no-drag">
      <button className="tool" title={note?.deletedAt ? 'Apagar permanentemente' : 'Mover para Apagadas Recentemente'} onClick={deleteNote} disabled={!note}>
        <Icon name="trash" />
      </button>
      <button className="tool" title="Nova nota (Ctrl+N)" onClick={newNote}>
        <Icon name="compose" />
      </button>
    </div>
  )
  const barEnd = (
    <div className="bar-end no-drag">
      {/* Fica ao lado da busca enquanto houver versão nova não instalada. */}
      {showUpdateButton(update) && (
        <button className="update-button" title={`Atualizar para a versão ${update.version}`} onClick={startUpdate}>
          Atualizar
        </button>
      )}
      <div className="search">
        <Icon name="search" size={15} />
        <input ref={searchRef} placeholder="Buscar" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQuery('')} />
      </div>
    </div>
  )

  const folderRow = (f, removable, icon = 'folder') => (
    <div
      key={f.id}
      className={`folder ${folderId === f.id ? 'sel' : ''}`}
      onClick={() => setFolderId(f.id)}
      onDoubleClick={() => f.id !== ALL && f.id !== TRASH && setRenaming(f.id)}
    >
      <Icon name={icon} size={17} />
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
      {/* Fica sempre montada para poder deslizar; fechada, o inert tira os botões do alcance do Tab. */}
      <aside className="sidebar" inert={sidebarOpen ? undefined : ''}>
        <div className="sidebar-inner">
          <div className="sidebar-top drag" />
          <div className="section-label">No Computador</div>
          {folderRow({ id: ALL, name: 'Todas as Notas' }, false)}
          {data.folders.map((f) => folderRow(f, f.id !== DEFAULT_FOLDER))}
          {/* Como no Mac, a pasta do lixo só aparece quando tem alguma nota dentro. */}
          {(trashCount > 0 || inTrashFolder) && folderRow({ id: TRASH, name: 'Apagadas Recentemente' }, false, 'trash')}
          <button className="new-folder" onClick={newFolder}>
            <Icon name="newFolder" size={17} /> Nova Pasta
          </button>
          {/* Para levar as notas para outro computador: exporta um arquivo .notas e importa do outro lado. */}
          <div className="backup-actions">
            <button title="Salvar todas as notas num arquivo .notas" onClick={exportAll}>
              <Icon name="export" size={16} /> Exportar
            </button>
            <button title="Trazer as notas de um arquivo .notas" onClick={importAll}>
              <Icon name="import" size={16} /> Importar
            </button>
          </div>
          <button className="about" title="O que mudou em cada versão" onClick={() => setNews({ title: 'Novidades', entries: allNews(currentVersion) })}>
            Notas {currentVersion} · Novidades
          </button>
        </div>
      </aside>

      <section className="list">
        <header className="list-bar drag">
          <div className="tools no-drag">
            <button className="tool" title="Mostrar/ocultar pastas" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <Icon name="sidebar" />
            </button>
          </div>
          {noteActions}
        </header>
        {/* A key recria a lista ao trocar de pasta: ela entra com um fade e volta para o topo.
            O tabIndex deixa a lista receber o foco: com ele, a nota selecionada fica amarela; sem, cinza. */}
        <div className="notes" key={folderId} ref={listRef} tabIndex={-1}>
          {inTrashFolder && trashCount > 0 && (
            <div className="trash-info">
              <span>As notas ficam aqui por {TRASH_DAYS} dias antes de serem apagadas de vez.</span>
              <button onClick={clearTrash}>Esvaziar</button>
            </div>
          )}
          {grouped.map(([group, notes]) => (
            <div key={group || 'lixo'}>
              {group && (
                <div className="group-label" data-flip={`grupo:${group}`}>
                  {group}
                </div>
              )}
              {notes.map((n) => (
                <div key={n.id} data-flip={n.id} className={`note-item ${n.id === noteId ? 'sel' : ''}`} onClick={() => selectNote(n.id)}>
                  <div className="note-title">{titleOf(n)}</div>
                  <div className="note-sub">
                    <span className="note-time">{n.deletedAt ? `${daysLeft(n)} ${daysLeft(n) === 1 ? 'dia' : 'dias'}` : shortDate(n.updatedAt)}</span>
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
            key={`${note.id}-${imports}`}
            note={note}
            editorRef={editorRef}
            onChange={(html, text) => updateNote(note.id, { html, text, updatedAt: Date.now() })}
            onTogglePin={() => updateNote(note.id, { pinned: !note.pinned })}
            onRestore={() => restore(note.id)}
            end={barEnd}
          />
        ) : (
          <>
            <header className="editor-bar drag">{barEnd}</header>
            <div className="no-note">Nenhuma nota selecionada</div>
          </>
        )}
      </main>

      {showUpdateModal(update) && (
        <UpdateModal
          update={update}
          currentVersion={currentVersion}
          onAccept={startUpdate}
          onDismiss={() => dispatchUpdate({ type: 'dismiss' })}
          onClose={() => dispatchUpdate({ type: 'close' })}
        />
      )}
      {/* Se as duas janelas quiserem abrir juntas, a de atualização vem primeiro. */}
      {news && !showUpdateModal(update) && <NewsModal {...news} onClose={() => setNews(null)} />}
    </div>
  )
}
