// @vitest-environment jsdom
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { ContextMenu, clampMenuPosition, submenuPosition } from '../src/components/ContextMenu.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

function mount(element) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root.render(element)
  })
}

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  container?.remove()
  container = null
})

describe('posicionamento do ContextMenu', () => {
  it('mantém o menu dentro da janela quando clicado perto das bordas', () => {
    expect(clampMenuPosition(100, 120, 200, 150, 1180, 760)).toEqual({ left: 100, top: 120 })
    // Perto da borda direita e inferior: vira para a esquerda e para cima
    expect(clampMenuPosition(1150, 720, 200, 150, 1180, 760)).toEqual({ left: 950, top: 570 })
    // Janela menor que o menu: respeita margem mínima sem valores negativos
    expect(clampMenuPosition(10, 10, 300, 200, 200, 150)).toEqual({ left: 8, top: 8 })
  })

  it('abre o submenu à direita e vira para a esquerda quando não cabe', () => {
    const leftSide = submenuPosition({ left: 100, right: 280, top: 200 }, 180, 120, 1180, 760)
    expect(leftSide).toEqual({ left: 278, top: 195 })

    const rightEdge = submenuPosition({ left: 950, right: 1130, top: 680 }, 180, 140, 1180, 760)
    expect(rightEdge).toEqual({ left: 772, top: 612 })
  })
})

describe('interações e teclado do ContextMenu', () => {
  it('fecha com Esc, clique fora e rolagem externa (mas não ao rolar dentro do menu)', () => {
    const onClose = vi.fn()
    mount(
      React.createElement(ContextMenu, {
        x: 100,
        y: 100,
        items: [{ id: 'a', label: 'Fixar', onSelect: () => {} }],
        onClose,
      }),
    )

    const menu = document.body.querySelector('.context-menu')
    expect(menu).not.toBeNull()

    // Rolar dentro do próprio menu não fecha
    act(() => {
      menu.dispatchEvent(new Event('scroll', { bubbles: false }))
    })
    expect(onClose).not.toHaveBeenCalled()

    // Esc fecha
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)

    // Clique fora fecha
    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(2)

    // Rolagem fora fecha
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('navega com setas, abre submenu com seta direita e executa com Enter pulando separadores e desabilitados', () => {
    const onMove = vi.fn()
    const onClose = vi.fn()
    mount(
      React.createElement(ContextMenu, {
        x: 50,
        y: 50,
        items: [
          { id: 'pin', label: 'Fixar', onSelect: () => {} },
          { type: 'separator' },
          {
            id: 'move',
            label: 'Mover para…',
            submenu: [
              { id: 'notes', label: 'Notas', active: true, disabled: true, onSelect: () => {} },
              { id: 'work', label: 'Trabalho', active: false, disabled: false, onSelect: onMove },
            ],
          },
        ],
        onClose,
      }),
    )

    // ↓ seleciona Fixar, ↓ pula separador e seleciona Mover para…
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })

    // → abre submenu e já seleciona o primeiro item habilitado ("Trabalho", pulando "Notas" desabilitado)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(document.body.querySelector('.context-submenu')).not.toBeNull()

    // Enter executa Trabalho e fecha o menu
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
