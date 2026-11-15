import React, { useEffect } from 'react'
import { noteSearchPluginKey } from '../editor/search.js'

export function FindBar({
  editor,
  open,
  showReplace,
  onToggleReplace,
  query,
  onQueryChange,
  caseSensitive,
  onToggleCase,
  replaceText,
  onReplaceTextChange,
  findInputRef,
  replaceInputRef,
  readOnly,
  onClose,
}) {
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    if (open) editor.commands.setNoteSearch(query, caseSensitive)
    else editor.commands.clearNoteSearch()
  }, [editor, open, query, caseSensitive])

  if (!open || !editor) return null

  const searchState = noteSearchPluginKey.getState(editor.state)
  const total = searchState?.matches.length || 0
  const active = searchState?.activeIndex ?? -1
  const counter = !query ? '' : total ? `${active + 1} de ${total}` : 'Sem resultados'

  const onFindKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) editor.commands.prevNoteMatch()
      else editor.commands.nextNoteMatch()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  const onReplaceKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      editor.commands.replaceNoteMatch(replaceText)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="find-bar no-drag" role="region" aria-label="Localizar na nota">
      <div className="find-row">
        {!readOnly && (
          <button
            className="find-btn expand"
            title={showReplace ? 'Ocultar substituição' : 'Mostrar substituição (Ctrl+H)'}
            onClick={() => onToggleReplace(!showReplace)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d={showReplace ? 'm6 9 6 6 6-6' : 'm9 18 6-6-6-6'} />
            </svg>
          </button>
        )}
        <input
          ref={findInputRef}
          className="find-input"
          placeholder="Localizar na nota"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onFindKey}
        />
        <span className={`find-count ${query && !total ? 'empty' : ''}`}>{counter}</span>
        <button
          className={`find-btn case ${caseSensitive ? 'on' : ''}`}
          title="Diferenciar maiúsculas e minúsculas"
          onClick={onToggleCase}
        >
          Aa
        </button>
        <button
          className="find-btn"
          title="Ocorrência anterior (Shift+F3)"
          disabled={!total}
          onClick={() => editor.commands.prevNoteMatch()}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="m18 15-6-6-6 6" />
          </svg>
        </button>
        <button
          className="find-btn"
          title="Próxima ocorrência (F3)"
          disabled={!total}
          onClick={() => editor.commands.nextNoteMatch()}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <button className="find-btn" title="Fechar (Esc)" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      {showReplace && !readOnly && (
        <div className="find-row replace-row">
          <input
            ref={replaceInputRef}
            className="find-input"
            placeholder="Substituir por"
            value={replaceText}
            onChange={(e) => onReplaceTextChange(e.target.value)}
            onKeyDown={onReplaceKey}
          />
          <button
            className="find-action"
            title="Substituir ocorrência atual (Enter)"
            disabled={!total}
            onClick={() => editor.commands.replaceNoteMatch(replaceText)}
          >
            Substituir
          </button>
          <button
            className="find-action"
            title="Substituir todas as ocorrências"
            disabled={!total}
            onClick={() => editor.commands.replaceAllNoteMatches(replaceText)}
          >
            Tudo
          </button>
        </div>
      )}
    </div>
  )
}

