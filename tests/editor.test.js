// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import { buildExtensions, nodeForAttachment } from '../src/editor/extensions.js'
import { isBlank, titleOf } from '../src/notes.js'

let editor
const create = (content = '') => (editor = new Editor({ extensions: buildExtensions({ onFiles: () => {} }), content }))
const text = () => editor.getText({ blockSeparator: '\n' })

afterEach(() => editor?.destroy())

describe('tabelas', () => {
  it('insere uma tabela 3×3', () => {
    create('<p>Compras</p>')
    editor.chain().focus('end').insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run()
    const html = editor.getHTML()
    expect(html.match(/<tr>/g)).toHaveLength(3)
    expect(html.match(/<td/g)).toHaveLength(9)
  })

  it('adiciona e apaga linhas e colunas', () => {
    create('<p>x</p>')
    editor.chain().focus('end').insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run()
    // comandos de tabela rodam um por vez: encadeados, as posições ficam desatualizadas
    editor.commands.addRowAfter()
    editor.commands.addColumnAfter()
    expect(editor.getHTML().match(/<td/g)).toHaveLength(9)
    editor.commands.deleteRow()
    expect(editor.getHTML().match(/<tr>/g)).toHaveLength(2)
    editor.commands.deleteTable()
    expect(editor.getHTML()).not.toContain('<table')
  })

  it('mantém a tabela ao salvar e abrir a nota de novo', () => {
    create('<p>Notas</p><table><tbody><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table>')
    const saved = editor.getHTML()
    editor.destroy()
    create(saved)
    expect(editor.getHTML()).toBe(saved)
    expect(text()).toContain('A')
  })
})

describe('imagens e anexos', () => {
  const image = { url: 'notas://anexos/abc-foto.png', name: 'foto.png', size: 1234, mime: 'image/png' }
  const pdf = { url: 'notas://anexos/def-contrato.pdf', name: 'contrato.pdf', size: 250000, mime: 'application/pdf' }

  it('imagem vira <img> e o resto vira cartão de anexo', () => {
    expect(nodeForAttachment(image).type).toBe('image')
    expect(nodeForAttachment(pdf).type).toBe('attachment')
  })

  it('insere uma imagem e ela sobrevive a salvar e abrir de novo', () => {
    create('<p>Viagem</p>')
    editor.chain().focus('end').insertContent(nodeForAttachment(image)).run()
    const saved = editor.getHTML()
    expect(saved).toContain('<img src="notas://anexos/abc-foto.png"')
    editor.destroy()
    create(saved)
    expect(editor.getHTML()).toBe(saved)
  })

  it('anexo guarda endereço, nome e tamanho e entra no texto da nota', () => {
    create('')
    editor.chain().focus().insertContent(nodeForAttachment(pdf)).run()
    const saved = editor.getHTML()
    expect(saved).toContain('data-src="notas://anexos/def-contrato.pdf"')
    expect(saved).toContain('data-name="contrato.pdf"')
    expect(saved).toContain('244 KB')

    editor.destroy()
    create(saved)
    const node = editor.state.doc.firstChild
    expect(node.type.name).toBe('attachment')
    expect(node.attrs).toMatchObject({ src: pdf.url, name: 'contrato.pdf', size: 250000 })
    expect(text()).toContain('📎 contrato.pdf')
  })

  it('nota só com imagem não é tratada como vazia', () => {
    create('')
    editor.chain().focus().insertContent(nodeForAttachment(image)).run()
    const n = { html: editor.getHTML(), text: text() }
    expect(isBlank(n)).toBe(false)
    expect(titleOf(n)).toBe('Imagem')
  })
})
