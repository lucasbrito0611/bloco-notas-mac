import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { buildExtensions, nodeForAttachment } from './editor/extensions.js'
import { initialUpdate, updateReducer, showUpdateModal, showUpdateButton } from './updates.js'
import { useListMotion, collapse } from './motion.js'
import { CHANGELOG, newsSince } from './changelog.js'
import { FindBar } from './components/FindBar.jsx'
import { PaletteModal } from './components/PaletteModal.jsx'
import appIcon from '../build/icon.png'
import {
  ALL,
  DEFAULT_FOLDER,
  uid,
  initialData,
  titleOf,
  previewOf,
  isBlank,
  normalize,
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
  quickOpenNotes,
  pushNavHistory,
  stepNavHistory,
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
  close: 'M18 6 6 18M6 6l12 12',
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

// Exportar a nota aberta (PDF, Markdown, texto) ou imprimir. Os mesmos comandos estão na paleta (Ctrl+Shift+P).
const SHARE_ACTIONS = [
  { label: 'Exportar como PDF…', format: 'pdf' },
  { label: 'Exportar como Markdown…', format: 'md' },
  { label: 'Exportar como texto…', format: 'txt' },
  { label: 'Imprimir… (Ctrl+Alt+P)', format: 'print' },
]

function ShareMenu({ onExport, onPrint }) {
  const { open, setOpen, ref } = usePopover()
  return (
    <div className="format-menu" ref={ref}>
      <button className={`tool ${open ? 'on' : ''}`} title="Exportar ou imprimir nota" onClick={() => setOpen(!open)}>
        <Icon name="export" />
      </button>
      {open && (
        <div className="popover">
          {SHARE_ACTIONS.map((a) => (
            <button
              key={a.format}
              className="fmt"
              onClick={() => {
                setOpen(false)
                if (a.format === 'print') onPrint()
                else onExport(a.format)
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
function NoteEditor({ note, onChange, onTogglePin, onRestore, onChordChange, onExport, onPrint, findBar, editorRef, end }) {
  const fileInput = useRef(null)
  const inTrash = Boolean(note.deletedAt)
  const editor = useEditor({
    extensions: buildExtensions({ onFiles: insertFiles, onChordChange }),
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
        <FindBar editor={editor} readOnly {...findBar} />
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
          <ShareMenu onExport={onExport} onPrint={onPrint} />
        </div>
        {end}
      </header>
      <FindBar editor={editor} readOnly={false} {...findBar} />
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
const clampZoom = (v) => Math.round(Math.min(1.8, Math.max(0.7, v)) * 10) / 10

export default function App() {
  const [data, setData] = useState(null)
  const [folderId, setFolderId] = useState(ALL)
  const [noteId, setNoteId] = useState(null)
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState(null)
  // Como no Mac, as pastas começam escondidas e o app lembra se você deixou a barra aberta.
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('barraLateralAberta') === 'sim')
  const [editorScale, setEditorScale] = useState(() => clampZoom(parseFloat(localStorage.getItem('zoomEditor')) || 1))
  const [zoomNotice, setZoomNotice] = useState(null)
  const [chord, setChord] = useState(null)
  const [findOpen, setFindOpen] = useState(false)
  const [findShowReplace, setFindShowReplace] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findCaseSensitive, setFindCaseSensitive] = useState(false)
  const [replaceText, setReplaceText] = useState('')
  const [palette, setPalette] = useState(null)
  const [update, dispatchUpdate] = useReducer(updateReducer, initialUpdate)
  const [currentVersion, setCurrentVersion] = useState('')
  // Janela de novidades: { title, entries } quando aberta.
  const [news, setNews] = useState(null)
  // Muda a cada importação, para o editor recarregar a nota aberta se ela veio atualizada no arquivo.
  const [imports, setImports] = useState(0)
  const searchRef = useRef(null)
  const sidebarRef = useRef(null)
  const editorRef = useRef(null)
  const listRef = useRef(null)
  const findInputRef = useRef(null)
  const replaceInputRef = useRef(null)
  const navHistoryRef = useRef({ stack: [], index: -1 })
  const navSteppingRef = useRef(false)
  const zoomTimerRef = useRef(null)
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
    localStorage.setItem('zoomEditor', String(editorScale))
  }, [editorScale])

  useEffect(() => () => clearTimeout(zoomTimerRef.current), [])

  useEffect(() => {
    if (!noteId) return
    if (navSteppingRef.current) {
      navSteppingRef.current = false
      return
    }
    navHistoryRef.current = pushNavHistory(navHistoryRef.current, noteId)
  }, [noteId])

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

  const navigateToNote = useCallback(
    (target) => {
      if (!target) return
      setData((d) => {
        const cur = d.notes.find((n) => n.id === noteId)
        if (cur && cur.id !== target.id && isBlank(cur)) return { ...d, notes: d.notes.filter((n) => n.id !== cur.id) }
        return d
      })
      if (target.deletedAt) setFolderId(TRASH)
      else if (folderId === TRASH || (folderId !== ALL && folderId !== target.folderId)) setFolderId(ALL)
      if (query && !filterNotes([target], { query }).length) setQuery('')
      setNoteId(target.id)
    },
    [noteId, folderId, query],
  )

  const stepHistory = useCallback(
    (delta) => {
      if (!data) return
      const valid = new Set(data.notes.filter((n) => !n.deletedAt).map((n) => n.id))
      const res = stepNavHistory(navHistoryRef.current, delta, valid)
      if (!res) return
      const target = data.notes.find((n) => n.id === res.noteId)
      if (!target) return
      navHistoryRef.current = res.history
      navSteppingRef.current = true
      navigateToNote(target)
    },
    [data, navigateToNote],
  )

  const stepNoteInList = useCallback(
    (delta) => {
      if (!visibleNotes.length) return
      const idx = visibleNotes.findIndex((n) => n.id === noteId)
      const nextIdx = idx === -1 ? (delta > 0 ? 0 : visibleNotes.length - 1) : Math.max(0, Math.min(visibleNotes.length - 1, idx + delta))
      const target = visibleNotes[nextIdx]
      if (target && target.id !== noteId) {
        selectNote(target.id)
        requestAnimationFrame(() => {
          listRef.current?.querySelector(`[data-flip="${CSS.escape(target.id)}"]`)?.scrollIntoView?.({ block: 'nearest' })
        })
      }
    },
    [visibleNotes, noteId, selectNote],
  )

  const applyZoom = useCallback((next) => {
    setEditorScale((prev) => {
      const clamped = clampZoom(typeof next === 'function' ? next(prev) : next)
      setZoomNotice(`Zoom ${Math.round(clamped * 100)}%`)
      clearTimeout(zoomTimerRef.current)
      zoomTimerRef.current = setTimeout(() => setZoomNotice(null), 1100)
      return clamped
    })
  }, [])

  const openFind = useCallback(
    (withReplace = false) => {
      if (!note) return
      const ed = editorRef.current
      if (ed && !ed.state.selection.empty) {
        const selText = ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to, '\n')
        if (selText && !selText.includes('\n') && selText.length <= 120) setFindQuery(selText)
      }
      const wantReplace = withReplace && !note.deletedAt
      setFindOpen(true)
      setFindShowReplace(wantReplace)
      requestAnimationFrame(() => {
        const input = wantReplace && findQuery ? replaceInputRef.current : findInputRef.current
        input?.focus()
        input?.select()
      })
    },
    [note, findQuery],
  )

  const closeFind = useCallback(() => {
    setFindOpen(false)
    editorRef.current?.commands.focusActiveNoteMatch()
    editorRef.current?.commands.clearNoteSearch()
    editorRef.current?.commands.focus()
  }, [])

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

  const restore = useCallback((id) => {
    setData((d) => restoreNote(d, id))
    setFolderId(ALL)
  }, [])

  const clearTrash = () => {
    const total = countNotes(data.notes, TRASH)
    if (!confirm(`Apagar ${total === 1 ? 'a nota' : `as ${total} notas`} de Apagadas Recentemente permanentemente? Essa ação não pode ser desfeita.`)) return
    removeForever(emptyTrash)
    setFolderId(ALL)
    setNoteId(filterNotes(data.notes)[0]?.id ?? null)
  }

  const exportAll = useCallback(async () => {
    try {
      await window.notesApi.exportNotes(dataRef.current, attachmentUrls(dataRef.current.notes))
    } catch (err) {
      alert(`Não foi possível exportar as notas.\n\n${ipcError(err)}`)
    }
  }, [])

  // Junta as notas do arquivo com as atuais (veja mergeData); o salvamento automático grava o resultado.
  const importAll = useCallback(async () => {
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
  }, [])

  // Exportar UMA nota (a aberta). O conteúdo vem do editor na hora: o HTML para o PDF e o JSON
  // (a árvore de blocos do TipTap) para o Markdown e o texto. O nome do arquivo sai do título.
  const noteForExport = useCallback(() => {
    const editor = editorRef.current
    if (!note || !editor) return null
    return { title: titleOf(note), html: editor.getHTML(), doc: editor.getJSON() }
  }, [note])

  const exportCurrentNote = useCallback(
    async (format) => {
      const payload = noteForExport()
      if (!payload) return
      try {
        await window.notesApi.exportNote(format, payload)
      } catch (err) {
        alert(`Não foi possível exportar a nota.

${ipcError(err)}`)
      }
    },
    [noteForExport],
  )

  const printCurrentNote = useCallback(async () => {
    const payload = noteForExport()
    if (!payload) return
    try {
      await window.notesApi.printNote(payload)
    } catch (err) {
      alert(`Não foi possível imprimir a nota.

${ipcError(err)}`)
    }
  }, [noteForExport])

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

  const focusSidebar = useCallback(() => {
    setSidebarOpen(true)
    requestAnimationFrame(() => sidebarRef.current?.focus())
  }, [])

  const paletteItems = useMemo(() => {
    if (!palette || !data) return []
    if (palette.mode === 'quickOpen') {
      return quickOpenNotes(data.notes, data.folders, palette.query).map(({ note: n, folderName }) => ({
        id: n.id,
        label: titleOf(n),
        sub: folderName || previewOf(n),
        badge: shortDate(n.updatedAt),
        run: () => {
          navigateToNote(n)
          requestAnimationFrame(() => editorRef.current?.commands.focus())
        },
      }))
    }

    const canEditNote = Boolean(note && !note.deletedAt)
    const commands = [
      { id: 'new-note', label: 'Nova nota', shortcut: 'Ctrl+N', run: newNote },
      { id: 'new-folder', label: 'Nova pasta', shortcut: 'Ctrl+Shift+N', run: newFolder },
      { id: 'quick-open', label: 'Ir para nota', shortcut: 'Ctrl+P', run: () => setPalette({ mode: 'quickOpen', query: '' }) },
      { id: 'toggle-sidebar', label: 'Mostrar / ocultar barra de pastas', shortcut: 'Ctrl+\\', run: () => setSidebarOpen((v) => !v) },
      { id: 'global-search', label: 'Buscar em todas as notas', shortcut: 'Ctrl+Shift+F', run: () => searchRef.current?.focus() },
      { id: 'focus-folders', label: 'Focar pastas', shortcut: 'Ctrl+1', run: focusSidebar },
      { id: 'focus-list', label: 'Focar lista de notas', shortcut: 'Ctrl+2', run: () => listRef.current?.focus() },
      { id: 'focus-editor', label: 'Focar editor', shortcut: 'Ctrl+3', run: () => editorRef.current?.commands.focus() },
      { id: 'hist-back', label: 'Nota anterior do histórico', shortcut: 'Alt+←', run: () => stepHistory(-1) },
      { id: 'hist-fwd', label: 'Próxima nota do histórico', shortcut: 'Alt+→', run: () => stepHistory(1) },
      { id: 'zoom-in', label: 'Aumentar zoom do editor', shortcut: 'Ctrl+=', run: () => applyZoom((z) => z + 0.1) },
      { id: 'zoom-out', label: 'Diminuir zoom do editor', shortcut: 'Ctrl+-', run: () => applyZoom((z) => z - 0.1) },
      { id: 'zoom-reset', label: 'Resetar zoom do editor', shortcut: 'Ctrl+0', run: () => applyZoom(1) },
      ...(note ? [{ id: 'find-note', label: 'Localizar na nota', shortcut: 'Ctrl+F', run: () => openFind(false) }] : []),
      ...(canEditNote
        ? [
            { id: 'replace-note', label: 'Localizar e substituir na nota', shortcut: 'Ctrl+H', run: () => openFind(true) },
            {
              id: 'pin-note',
              label: note.pinned ? 'Desafixar nota' : 'Fixar nota',
              run: () => updateNote(note.id, { pinned: !note.pinned }),
            },
            { id: 'del-note', label: 'Mover nota para lixeira', shortcut: 'Delete', run: deleteNote },
            { id: 'fmt-h1', label: 'Formatar como Título', shortcut: 'Ctrl+Alt+1', run: () => editorRef.current?.chain().focus().setHeading({ level: 1 }).run() },
            { id: 'fmt-h2', label: 'Formatar como Cabeçalho', shortcut: 'Ctrl+Alt+2', run: () => editorRef.current?.chain().focus().setHeading({ level: 2 }).run() },
            { id: 'fmt-h3', label: 'Formatar como Subcabeçalho', shortcut: 'Ctrl+Alt+3', run: () => editorRef.current?.chain().focus().setHeading({ level: 3 }).run() },
            { id: 'fmt-p', label: 'Formatar como Corpo', shortcut: 'Ctrl+Alt+0', run: () => editorRef.current?.chain().focus().setParagraph().run() },
            { id: 'fmt-task', label: 'Alternar lista de verificação', shortcut: 'Ctrl+Shift+L', run: () => editorRef.current?.chain().focus().toggleTaskList().run() },
            { id: 'fmt-bullet', label: 'Alternar lista com marcadores', shortcut: 'Ctrl+Shift+8', run: () => editorRef.current?.chain().focus().toggleBulletList().run() },
            { id: 'fmt-ordered', label: 'Alternar lista numerada', shortcut: 'Ctrl+Shift+7', run: () => editorRef.current?.chain().focus().toggleOrderedList().run() },
            { id: 'fmt-quote', label: 'Alternar citação', shortcut: 'Ctrl+Shift+B', run: () => editorRef.current?.chain().focus().toggleBlockquote().run() },
            { id: 'fmt-code', label: 'Alternar bloco monoespaçado', shortcut: 'Ctrl+Alt+C', run: () => editorRef.current?.chain().focus().toggleCodeBlock().run() },
            { id: 'ins-table', label: 'Inserir tabela 3×3', run: () => editorRef.current?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run() },
            { id: 'move-up', label: 'Mover linha para cima', shortcut: 'Alt+↑', run: () => editorRef.current?.chain().focus().moveLinesUp().run() },
            { id: 'move-down', label: 'Mover linha para baixo', shortcut: 'Alt+↓', run: () => editorRef.current?.chain().focus().moveLinesDown().run() },
            { id: 'dup-up', label: 'Duplicar linha acima', shortcut: 'Alt+Shift+↑', run: () => editorRef.current?.chain().focus().duplicateLinesUp().run() },
            { id: 'dup-down', label: 'Duplicar linha abaixo', shortcut: 'Alt+Shift+↓', run: () => editorRef.current?.chain().focus().duplicateLinesDown().run() },
            { id: 'del-line', label: 'Apagar linha inteira', shortcut: 'Ctrl+Shift+K', run: () => editorRef.current?.chain().focus().deleteLines().run() },
            { id: 'sel-all-occ', label: 'Selecionar todas as ocorrências iguais', shortcut: 'Ctrl+Alt+L', run: () => editorRef.current?.chain().focus().selectAllOccurrences().run() },
          ]
        : []),
      ...(note?.deletedAt ? [{ id: 'restore-note', label: 'Recuperar nota da lixeira', run: () => restore(note.id) }] : []),
      ...(folderId !== ALL && folderId !== TRASH
        ? [{ id: 'rename-folder', label: 'Renomear pasta atual', shortcut: 'F2', run: () => setRenaming(folderId) }]
        : []),
      ...(note
        ? [
            { id: 'export-pdf', label: 'Exportar nota como PDF', run: () => exportCurrentNote('pdf') },
            { id: 'export-md', label: 'Exportar nota como Markdown', run: () => exportCurrentNote('md') },
            { id: 'export-txt', label: 'Exportar nota como texto', run: () => exportCurrentNote('txt') },
            { id: 'print-note', label: 'Imprimir nota', shortcut: 'Ctrl+Alt+P', run: printCurrentNote },
          ]
        : []),
      { id: 'export', label: 'Exportar notas (.notas)', run: exportAll },
      { id: 'import', label: 'Importar notas (.notas)', run: importAll },
      { id: 'news', label: 'Ver novidades da versão', run: () => setNews({ title: 'Novidades', entries: allNews(currentVersion) }) },
    ]

    const q = normalize(palette.query.trim())
    return q ? commands.filter((c) => normalize(c.label).includes(q) || normalize(c.shortcut || '').includes(q)) : commands
  }, [palette, data, note, folderId, currentVersion, newNote, newFolder, focusSidebar, stepHistory, applyZoom, openFind, updateNote, deleteNote, restore, exportAll, importAll, navigateToNote, exportCurrentNote, printCurrentNote])

  // atalhos globais (app + navegação VS Code)
  useEffect(() => {
    const onKey = (e) => {
      if (showUpdateModal(update) || news || renaming) return
      // Ctrl+Alt+P: imprimir (Ctrl+P já é "ir para nota"). Vem antes do teste de AltGr porque, em
      // teclados como o ABNT2, o Windows pode marcar Ctrl+Alt como AltGr. Conferir e.key === 'p'
      // garante que não é um AltGr digitando outra letra (no US-Internacional, AltGr+P digita "ö").
      if (!palette && e.ctrlKey && e.altKey && !e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        printCurrentNote()
        return
      }
      if (e.getModifierState?.('AltGraph')) return

      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()

      if (mod && !e.altKey && k === 'p' && e.shiftKey) {
        e.preventDefault()
        setPalette((p) => (p?.mode === 'commands' ? null : { mode: 'commands', query: '' }))
        return
      }
      if (mod && !e.altKey && !e.shiftKey && k === 'p') {
        e.preventDefault()
        setPalette((p) => (p?.mode === 'quickOpen' ? null : { mode: 'quickOpen', query: '' }))
        return
      }
      if (palette) return

      if (!mod && e.altKey && !e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        stepHistory(e.key === 'ArrowLeft' ? -1 : 1)
        return
      }
      if (!mod && !e.altKey && e.key === 'F3' && findOpen && editorRef.current) {
        e.preventDefault()
        if (e.shiftKey) editorRef.current.commands.prevNoteMatch()
        else editorRef.current.commands.nextNoteMatch()
        return
      }
      if (!mod && !e.altKey && !e.shiftKey && e.key === 'F2') {
        const active = document.activeElement
        if (sidebarOpen && folderId !== ALL && folderId !== TRASH && !active?.closest?.('.ProseMirror, input, textarea')) {
          e.preventDefault()
          setRenaming(folderId)
        }
        return
      }

      if (!mod || e.altKey) return

      if (k === 'n' && e.shiftKey) newFolder()
      else if (k === 'n' && !e.shiftKey) newNote()
      else if (k === 'f' && e.shiftKey) {
        searchRef.current?.focus()
        searchRef.current?.select()
      } else if (k === 'f' && !e.shiftKey) openFind(false)
      else if (k === 'h' && !e.shiftKey) openFind(true)
      else if (k === 'l' && e.shiftKey) editorRef.current?.chain().focus().toggleTaskList().run()
      else if (!e.shiftKey && (e.key === '\\' || e.code === 'Backslash')) setSidebarOpen((v) => !v)
      else if (!e.shiftKey && e.key === '1') focusSidebar()
      else if (!e.shiftKey && e.key === '2') listRef.current?.focus()
      else if (!e.shiftKey && e.key === '3') editorRef.current?.commands.focus()
      else if (!e.shiftKey && e.key === 'PageUp') stepNoteInList(-1)
      else if (!e.shiftKey && e.key === 'PageDown') stepNoteInList(1)
      else if (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd') applyZoom((z) => z + 0.1)
      else if (e.key === '-' || e.code === 'Minus' || e.code === 'NumpadSubtract') applyZoom((z) => z - 0.1)
      else if (!e.shiftKey && (e.key === '0' || e.code === 'Numpad0')) applyZoom(1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [update, news, renaming, palette, findOpen, sidebarOpen, folderId, newNote, newFolder, openFind, focusSidebar, stepHistory, stepNoteInList, applyZoom, printCurrentNote])

  if (!data) return null

  const count = (id) => countNotes(data.notes, id)
  const trashCount = count(TRASH)
  const inTrashFolder = folderId === TRASH
  const visibleFolderIds = [ALL, ...data.folders.map((f) => f.id), ...(trashCount > 0 || inTrashFolder ? [TRASH] : [])]

  const onSidebarKeyDown = (e) => {
    if (renaming) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const idx = visibleFolderIds.indexOf(folderId)
      const nextIdx = Math.max(0, Math.min(visibleFolderIds.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1)))
      setFolderId(visibleFolderIds[nextIdx])
    } else if (e.key === 'F2' && folderId !== ALL && folderId !== TRASH) {
      e.preventDefault()
      setRenaming(folderId)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      listRef.current?.focus()
    }
  }

  const onListKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      stepNoteInList(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      stepNoteInList(-1)
    } else if (e.key === 'Delete') {
      e.preventDefault()
      deleteNote()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      editorRef.current?.commands.focus()
    }
  }

  const findBar = {
    open: findOpen,
    showReplace: findShowReplace,
    onToggleReplace: setFindShowReplace,
    query: findQuery,
    onQueryChange: setFindQuery,
    caseSensitive: findCaseSensitive,
    onToggleCase: () => setFindCaseSensitive((v) => !v),
    replaceText,
    onReplaceTextChange: setReplaceText,
    findInputRef,
    replaceInputRef,
    onClose: closeFind,
  }

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
      <div className="search" title="Buscar em todas as notas (Ctrl+Shift+F)">
        <Icon name="search" size={15} />
        <input ref={searchRef} placeholder="Buscar" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQuery('')} />
        {query && (
          <button className="search-clear" title="Limpar busca" onClick={() => setQuery('')}>
            <Icon name="close" size={13} />
          </button>
        )}
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
    <div className={`app ${sidebarOpen ? '' : 'no-sidebar'}`} style={{ '--editor-scale': editorScale }}>
      {/* Fica sempre montada para poder deslizar; fechada, o inert tira os botões do alcance do Tab. */}
      <aside className="sidebar" inert={sidebarOpen ? undefined : ''}>
        <div className="sidebar-inner" ref={sidebarRef} tabIndex={-1} onKeyDown={onSidebarKeyDown}>
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
            <button className="tool" title="Mostrar/ocultar pastas (Ctrl+\)" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <Icon name="sidebar" />
            </button>
          </div>
          {noteActions}
        </header>
        {/* A key recria a lista ao trocar de pasta: ela entra com um fade e volta para o topo.
            O tabIndex deixa a lista receber o foco: com ele, a nota selecionada fica amarela; sem, cinza. */}
        <div className="notes" key={folderId} ref={listRef} tabIndex={-1} onKeyDown={onListKeyDown}>
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
            onChordChange={setChord}
            onExport={exportCurrentNote}
            onPrint={printCurrentNote}
            findBar={findBar}
            end={barEnd}
          />
        ) : (
          <>
            <header className="editor-bar drag">{barEnd}</header>
            <div className="no-note">Nenhuma nota selecionada</div>
          </>
        )}
        {chord === 'ctrl-k' && <div className="editor-toast">Ctrl+K pressionado — aguarde Ctrl+D para pular ocorrência</div>}
        {zoomNotice && <div className="editor-toast">{zoomNotice}</div>}
      </main>

      {palette && (
        <PaletteModal
          mode={palette.mode}
          query={palette.query}
          onQueryChange={(q) => setPalette((p) => (p ? { ...p, query: q } : null))}
          items={paletteItems}
          onClose={() => setPalette(null)}
        />
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
      {/* Se as duas janelas quiserem abrir juntas, a de atualização vem primeiro. */}
      {news && !showUpdateModal(update) && <NewsModal {...news} onClose={() => setNews(null)} />}
    </div>
  )
}
