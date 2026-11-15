import React, { useEffect, useRef, useState } from 'react'

export function PaletteModal({ mode, query, onQueryChange, items, onClose }) {
  const [selected, setSelected] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    setSelected(0)
  }, [query, mode])

  useEffect(() => {
    inputRef.current?.focus()
  }, [mode])

  useEffect(() => {
    const activeEl = listRef.current?.children[selected]
    activeEl?.scrollIntoView?.({ block: 'nearest' })
  }, [selected])

  const execute = (item) => {
    if (!item) return
    onClose()
    item.run()
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (items.length) setSelected((i) => (i + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (items.length) setSelected((i) => (i - 1 + items.length) % items.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      execute(items[selected])
    }
  }

  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="palette-modal"
        role="dialog"
        aria-label={mode === 'quickOpen' ? 'Ir para nota' : 'Paleta de comandos'}
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          className="palette-input"
          placeholder={mode === 'quickOpen' ? 'Ir para nota…' : 'Digite um comando…'}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        <div className="palette-list" ref={listRef}>
          {items.map((item, i) => (
            <button
              key={item.id}
              className={`palette-item ${i === selected ? 'sel' : ''}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => execute(item)}
            >
              <span className="palette-main">
                <span className="palette-label">{item.label}</span>
                {item.sub && <span className="palette-sub">{item.sub}</span>}
              </span>
              {item.badge && <span className="palette-badge">{item.badge}</span>}
              {item.shortcut && <kbd className="palette-kbd">{item.shortcut}</kbd>}
            </button>
          ))}
          {!items.length && <div className="palette-empty">Nenhum resultado</div>}
        </div>
      </div>
    </div>
  )
}

