import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const VIEWPORT_MARGIN = 8

// Mantém o menu inteiro dentro da janela visível: se não couber à direita ou abaixo do cursor,
// "vira" para o outro lado e garante uma folga mínima das bordas.
export function clampMenuPosition(x, y, width, height, viewportWidth, viewportHeight, margin = VIEWPORT_MARGIN) {
  let left = x
  let top = y
  if (left + width > viewportWidth - margin) left = x - width
  if (top + height > viewportHeight - margin) top = y - height
  const maxLeft = Math.max(margin, viewportWidth - width - margin)
  const maxTop = Math.max(margin, viewportHeight - height - margin)
  return {
    left: Math.max(margin, Math.min(left, maxLeft)),
    top: Math.max(margin, Math.min(top, maxTop)),
  }
}

// Abre o submenu à direita do item pai; se for vazar da borda direita, abre à esquerda.
export function submenuPosition(parentRect, width, height, viewportWidth, viewportHeight, margin = VIEWPORT_MARGIN) {
  let left = parentRect.right - 2
  if (left + width > viewportWidth - margin) left = parentRect.left - width + 2
  const maxLeft = Math.max(margin, viewportWidth - width - margin)
  const maxTop = Math.max(margin, viewportHeight - height - margin)
  return {
    left: Math.max(margin, Math.min(left, maxLeft)),
    top: Math.max(margin, Math.min(parentRect.top - 5, maxTop)),
  }
}

const isActionable = (item) => Boolean(item && item.type !== 'separator' && !item.disabled)

function nextEnabledIndex(items, from, delta) {
  const len = items.length
  if (!len) return -1
  let idx = from
  for (let step = 0; step < len; step++) {
    if (idx === -1) idx = delta > 0 ? 0 : len - 1
    else idx = (idx + delta + len) % len
    if (isActionable(items[idx])) return idx
  }
  return -1
}

const firstEnabledIndex = (items) => items.findIndex(isActionable)
const lastEnabledIndex = (items) => {
  for (let i = items.length - 1; i >= 0; i--) if (isActionable(items[i])) return i
  return -1
}

// Menu flutuante (clique direito ou suspenso) renderizado num portal no document.body,
// para nunca ser cortado por overflow: hidden nem deslocado por animações dos pais.
export function ContextMenu({ x, y, items, ariaLabel = 'Menu de contexto', onClose }) {
  const menuRef = useRef(null)
  const subRef = useRef(null)
  const itemRefs = useRef([])
  const [pos, setPos] = useState({ left: x, top: y })
  const [subPos, setSubPos] = useState(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [subOpenIndex, setSubOpenIndex] = useState(null)
  const [subActiveIndex, setSubActiveIndex] = useState(-1)
  const [focusInSub, setFocusInSub] = useState(false)

  const subItems = subOpenIndex !== null ? items[subOpenIndex]?.submenu || null : null
  const mainHasChecks = items.some((i) => i.active !== undefined)
  const subHasChecks = Boolean(subItems?.some((i) => i.active !== undefined))

  // Mede o menu antes da primeira pintura na tela para encaixar dentro da janela sem piscar.
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos(clampMenuPosition(x, y, rect.width, rect.height, window.innerWidth, window.innerHeight))
  }, [x, y, items])

  useLayoutEffect(() => {
    if (subOpenIndex === null || !subRef.current) {
      setSubPos(null)
      return
    }
    const triggerEl = itemRefs.current[subOpenIndex]
    if (!triggerEl) return
    const parentRect = triggerEl.getBoundingClientRect()
    const subRect = subRef.current.getBoundingClientRect()
    setSubPos(submenuPosition(parentRect, subRect.width, subRect.height, window.innerWidth, window.innerHeight))
  }, [subOpenIndex, subItems, pos])

  useEffect(() => {
    menuRef.current?.focus({ preventScroll: true })
  }, [])

  // Fecha ao clicar fora, ao rolar qualquer lista fora do menu, ou ao perder foco/redimensionar a janela.
  useEffect(() => {
    const inside = (target) => target instanceof Node && (menuRef.current?.contains(target) || subRef.current?.contains(target))
    const onMouseDown = (e) => {
      if (inside(e.target)) return
      onClose()
    }
    const onScroll = (e) => {
      if (inside(e.target)) return
      onClose()
    }
    const onBlurOrResize = () => onClose()

    window.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onBlurOrResize)
    window.addEventListener('blur', onBlurOrResize)
    return () => {
      window.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onBlurOrResize)
      window.removeEventListener('blur', onBlurOrResize)
    }
  }, [onClose])

  // Navegação completa por teclado: setas, Home/End, Enter/Espaço e Esc.
  useEffect(() => {
    const runItem = (item) => {
      if (!isActionable(item)) return
      onClose()
      item.onSelect?.()
    }

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }

      if (focusInSub && subItems) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSubActiveIndex((i) => nextEnabledIndex(subItems, i, 1))
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSubActiveIndex((i) => nextEnabledIndex(subItems, i, -1))
        } else if (e.key === 'Home') {
          e.preventDefault()
          setSubActiveIndex(firstEnabledIndex(subItems))
        } else if (e.key === 'End') {
          e.preventDefault()
          setSubActiveIndex(lastEnabledIndex(subItems))
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          setFocusInSub(false)
          setSubOpenIndex(null)
          setSubActiveIndex(-1)
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          runItem(subItems[subActiveIndex])
        }
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSubOpenIndex(null)
        setActiveIndex((i) => nextEnabledIndex(items, i, 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSubOpenIndex(null)
        setActiveIndex((i) => nextEnabledIndex(items, i, -1))
      } else if (e.key === 'Home') {
        e.preventDefault()
        setSubOpenIndex(null)
        setActiveIndex(firstEnabledIndex(items))
      } else if (e.key === 'End') {
        e.preventDefault()
        setSubOpenIndex(null)
        setActiveIndex(lastEnabledIndex(items))
      } else if (e.key === 'ArrowRight') {
        const cur = items[activeIndex]
        if (cur?.submenu?.length) {
          e.preventDefault()
          setSubOpenIndex(activeIndex)
          setFocusInSub(true)
          setSubActiveIndex(firstEnabledIndex(cur.submenu))
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        const cur = items[activeIndex]
        if (!cur) return
        e.preventDefault()
        if (cur.submenu?.length) {
          setSubOpenIndex(activeIndex)
          setFocusInSub(true)
          setSubActiveIndex(firstEnabledIndex(cur.submenu))
        } else {
          runItem(cur)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [items, activeIndex, subItems, subActiveIndex, focusInSub, onClose])

  const content = (
    <>
      <div
        ref={menuRef}
        className={`context-menu ${mainHasChecks ? 'has-checks' : ''}`}
        role="menu"
        aria-label={ariaLabel}
        tabIndex={-1}
        style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {items.map((item, i) => {
          if (item.type === 'separator') {
            return <div key={item.id || `sep-${i}`} className="context-sep" role="separator" />
          }
          const hasSub = Boolean(item.submenu?.length)
          const isActive = i === activeIndex || (hasSub && i === subOpenIndex)
          return (
            <button
              key={item.id || item.label}
              ref={(el) => (itemRefs.current[i] = el)}
              type="button"
              role="menuitem"
              aria-haspopup={hasSub ? 'menu' : undefined}
              aria-expanded={hasSub ? i === subOpenIndex : undefined}
              disabled={item.disabled}
              className={`context-item ${isActive ? 'active' : ''} ${item.danger ? 'danger' : ''} ${item.active ? 'checked' : ''}`}
              onMouseEnter={() => {
                if (item.disabled) return
                setActiveIndex(i)
                setFocusInSub(false)
                setSubActiveIndex(-1)
                setSubOpenIndex(hasSub ? i : null)
              }}
              onClick={() => {
                if (item.disabled) return
                if (hasSub) {
                  setSubOpenIndex(i)
                  setFocusInSub(true)
                  setSubActiveIndex(firstEnabledIndex(item.submenu))
                  return
                }
                onClose()
                item.onSelect?.()
              }}
            >
              <span className="context-label">{item.label}</span>
              {hasSub && (
                <svg className="context-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              )}
            </button>
          )
        })}
      </div>

      {subItems && (
        <div
          ref={subRef}
          className={`context-menu context-submenu ${subHasChecks ? 'has-checks' : ''}`}
          role="menu"
          aria-label={items[subOpenIndex]?.label}
          style={subPos ? { left: `${subPos.left}px`, top: `${subPos.top}px` } : { left: `${pos.left}px`, top: `${pos.top}px`, visibility: 'hidden' }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {subItems.map((sub, j) => {
            if (sub.type === 'separator') {
              return <div key={sub.id || `sub-sep-${j}`} className="context-sep" role="separator" />
            }
            return (
              <button
                key={sub.id || sub.label}
                type="button"
                role="menuitem"
                disabled={sub.disabled}
                className={`context-item ${j === subActiveIndex ? 'active' : ''} ${sub.danger ? 'danger' : ''} ${sub.active ? 'checked' : ''}`}
                onMouseEnter={() => {
                  if (sub.disabled) return
                  setFocusInSub(true)
                  setSubActiveIndex(j)
                }}
                onClick={() => {
                  if (sub.disabled) return
                  onClose()
                  sub.onSelect?.()
                }}
              >
                <span className="context-label">{sub.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </>
  )

  return createPortal(content, document.body)
}
