// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import { Fragment, Slice } from '@tiptap/pm/model'
import { buildExtensions } from '../src/editor/extensions.js'
import { safeLinkHref, linkableHrefOf, shouldOpenLinkOnClick, linkOptions } from '../src/editor/link.js'
import { isBlank, titleOf, previewOf } from '../src/notes.js'

let editor
const create = (content = '', extra = {}) =>
  (editor = new Editor({ extensions: buildExtensions({ onFiles: () => {} }), content, ...extra }))

afterEach(() => {
  editor?.destroy()
  vi.restoreAllMocks()
})

// Simula colar texto no editor (passa pelo handlePaste, como o navegador faria).
const paste = (str) => {
  const { schema } = editor
  const slice = new Slice(Fragment.from(schema.nodes.paragraph.create(null, schema.text(str))), 0, 0)
  return editor.view.someProp('handlePaste', (fn) => fn(editor.view, new Event('paste'), slice))
}

// Digita o texto como se fosse o usuário (o autolink reage ao espaço depois da URL).
const type = (str) => editor.commands.insertContent(str)

const anchors = () => [...editor.view.dom.querySelectorAll('a')]
const click = (el, init = {}) =>
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }))

describe('protocolos permitidos', () => {
  it('aceita http, https e mailto', () => {
    expect(safeLinkHref('https://exemplo.com/a?b=1')).toBe('https://exemplo.com/a?b=1')
    expect(safeLinkHref('http://exemplo.com')).toBe('http://exemplo.com')
    expect(safeLinkHref('mailto:ana@exemplo.com')).toBe('mailto:ana@exemplo.com')
    expect(safeLinkHref('  https://exemplo.com  ')).toBe('https://exemplo.com')
  })

  it('recusa javascript:, file:, data: e relativas', () => {
    for (const url of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'java\tscript:alert(1)',
      'file:///C:/Windows/system32/calc.exe',
      'data:text/html,<script>alert(1)</script>',
      'ftp://exemplo.com',
      '/pasta/arquivo',
      '',
      null,
      undefined,
    ]) {
      expect(safeLinkHref(url), url).toBeNull()
    }
  })

  it('o autolink só cria link a partir de protocolo seguro', () => {
    expect(linkableHrefOf('www.exemplo.com')).toBe('http://www.exemplo.com')
    expect(linkableHrefOf('exemplo.com:8080')).toBe('http://exemplo.com:8080')
    expect(linkOptions.shouldAutoLink('www.exemplo.com')).toBe(true)
    expect(linkOptions.shouldAutoLink('javascript:alert(1)')).toBe(false)
    expect(linkOptions.shouldAutoLink('file:///C:/x')).toBe(false)
    expect(linkOptions.shouldAutoLink('/pasta')).toBe(false)
  })

  it('isAllowedUri (usado ao criar, ler e desenhar o link) segue a mesma regra', () => {
    expect(linkOptions.isAllowedUri('https://exemplo.com')).toBe(true)
    expect(linkOptions.isAllowedUri('www.exemplo.com')).toBe(true)
    expect(linkOptions.isAllowedUri('javascript:alert(1)')).toBe(false)
    expect(linkOptions.isAllowedUri('/pasta')).toBe(false)
    expect(linkOptions.isAllowedUri('')).toBe(false)
  })
})

describe('Ctrl+clique', () => {
  it('só abre com Ctrl e botão esquerdo, sem Alt (AltGr) nem Shift', () => {
    expect(shouldOpenLinkOnClick({ button: 0, ctrlKey: true, altKey: false, shiftKey: false })).toBe(true)
    expect(shouldOpenLinkOnClick({ button: 0, ctrlKey: false })).toBe(false)
    expect(shouldOpenLinkOnClick({ button: 0, ctrlKey: true, altKey: true })).toBe(false)
    expect(shouldOpenLinkOnClick({ button: 2, ctrlKey: true })).toBe(false)
  })

  it('Ctrl+clique abre o link no navegador, sem target', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    create('<p><a href="https://exemplo.com">site</a></p>')
    click(anchors()[0], { ctrlKey: true })
    expect(open).toHaveBeenCalledWith('https://exemplo.com', '_blank')
  })

  it('clique simples não abre o link', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    create('<p><a href="https://exemplo.com">site</a></p>')
    click(anchors()[0])
    expect(open).not.toHaveBeenCalled()
  })

  it('ignora o target do HTML: abre em _blank pelo app, nunca navega a janela', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    create('<p><a href="https://exemplo.com" target="_self">site</a></p>')
    click(anchors()[0], { ctrlKey: true })
    expect(open).toHaveBeenCalledWith('https://exemplo.com', '_blank')
  })

  it('Ctrl+clique num link com protocolo proibido não abre nada', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    create('<p><a href="javascript:alert(1)">mal</a></p>')
    expect(anchors()).toHaveLength(0) // o link nem chega ao editor
    expect(open).not.toHaveBeenCalled()
  })

  it('funciona na nota somente leitura (lixeira)', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    create('<p><a href="https://exemplo.com">site</a></p>')
    editor.setEditable(false, false)
    click(anchors()[0], { ctrlKey: true })
    expect(open).toHaveBeenCalledWith('https://exemplo.com', '_blank')
  })

  it('marca o editor com data-ctrl enquanto o Ctrl está apertado', () => {
    create('<p>x</p>')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true }))
    expect(editor.view.dom.hasAttribute('data-ctrl')).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', ctrlKey: false }))
    expect(editor.view.dom.hasAttribute('data-ctrl')).toBe(false)
  })
})

describe('criação de links', () => {
  it('colar uma URL sobre texto selecionado transforma a seleção em link', () => {
    create('<p>veja o site</p>')
    editor.commands.setTextSelection({ from: 6, to: 10 }) // "o si" (o parágrafo começa na posição 1)
    expect(paste('https://exemplo.com')).toBe(true)
    expect(editor.getHTML()).toMatch(/<a [^>]*href="https:\/\/exemplo\.com">o si<\/a>/)
  })

  it('colar uma URL sem seleção não cria link pelo paste', () => {
    create('<p>x</p>')
    editor.commands.setTextSelection(1)
    paste('https://exemplo.com')
    expect(anchors()).toHaveLength(0)
  })

  it('URL digitada vira link automaticamente (autolink)', () => {
    create('<p></p>')
    type('acesse https://exemplo.com ')
    expect(editor.getHTML()).toMatch(/<a [^>]*href="https:\/\/exemplo\.com"/)
    expect(editor.getText()).toContain('acesse https://exemplo.com')
  })

  it('domínio sem protocolo vira link http', () => {
    create('<p></p>')
    type('visite www.exemplo.com ')
    expect(editor.getHTML()).toMatch(/<a [^>]*href="http:\/\/www\.exemplo\.com"/)
  })

  it('texto relativo ou com protocolo proibido não vira link', () => {
    create('<p></p>')
    type('veja /pasta/arquivo ')
    expect(editor.getHTML()).not.toContain('<a')
  })

  it('texto com protocolo proibido não vira link', () => {
    create('<p></p>')
    type('rode javascript:alert(1) ')
    expect(editor.getHTML()).not.toContain('<a')
  })

  it('setLink recusa protocolo proibido', () => {
    create('<p>texto</p>')
    editor.commands.selectAll()
    expect(editor.commands.setLink({ href: 'javascript:alert(1)' })).toBe(false)
    expect(editor.getHTML()).not.toContain('<a')
  })
})

describe('HTML guardado e texto da nota', () => {
  const html = '<p>Veja <a href="https://exemplo.com">este site</a> hoje</p>\n<p>Segunda linha</p>'

  it('salva <a href> sem target e sobrevive a salvar e abrir de novo', () => {
    create(html)
    const saved = editor.getHTML()
    expect(saved).toMatch(/<a [^>]*href="https:\/\/exemplo\.com"/)
    expect(saved).not.toContain('target=')
    editor.destroy()
    create(saved)
    expect(editor.getHTML()).toBe(saved)
  })

  it('o texto puro não inclui a URL, então título, prévia e busca seguem o texto visível', () => {
    create(html)
    const text = editor.getText({ blockSeparator: '\n' })
    expect(text).toBe('Veja este site hoje\nSegunda linha')
    const note = { text, html: editor.getHTML(), updatedAt: 0 }
    expect(titleOf(note)).toBe('Veja este site hoje')
    expect(previewOf(note)).toBe('Segunda linha')
    expect(text).not.toContain('exemplo.com')
    expect(isBlank(note)).toBe(false)
  })

  it('uma nota só com link continua não vazia', () => {
    create('<p><a href="https://exemplo.com">https://exemplo.com</a></p>')
    expect(isBlank({ text: editor.getText(), html: editor.getHTML() })).toBe(false)
  })
})

describe('montagem do editor', () => {
  it('monta com todas as extensões e só uma cópia do Link', () => {
    create('<p>ok</p>')
    const names = editor.extensionManager.extensions.map((e) => e.name)
    expect(names.filter((n) => n === 'link')).toHaveLength(1)
    expect(names).toContain('linkOpenOnCtrlClick')
    expect(editor.getText()).toBe('ok')
  })

  it('ao destruir o editor, os listeners de Ctrl são removidos', () => {
    create('<p>x</p>')
    const dom = editor.view.dom
    editor.destroy()
    editor = null
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true }))
    expect(dom.hasAttribute('data-ctrl')).toBe(false)
  })
})
