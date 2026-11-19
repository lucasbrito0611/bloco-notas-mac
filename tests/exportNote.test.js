// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import { buildExtensions } from '../src/editor/extensions.js'
import exportNote from '../electron/exportNote.cjs'

const { safeExportName, assetSources, assetFileNames, toMarkdown, toPlainText, buildPrintHtml } = exportNote

// O JSON vem do editor de verdade, com as mesmas extensões do app: assim os testes usam
// os nomes reais dos nós (taskItem, tableHeader, attachment…) e não um JSON escrito à mão.
let editor
const docOf = (html) => {
  editor = new Editor({ extensions: buildExtensions(), content: html })
  return editor.getJSON()
}
const md = (html, opts) => toMarkdown(docOf(html), opts)
const txt = (html) => toPlainText(docOf(html))

afterEach(() => editor?.destroy())

describe('safeExportName', () => {
  it('tira caracteres proibidos no Windows', () => {
    expect(safeExportName('a\\b/c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j')
  })

  it('tira pontos e espaços do fim e junta espaços', () => {
    expect(safeExportName('  Compras   do mês...  ')).toBe('Compras do mês')
  })

  it('evita nomes reservados do Windows', () => {
    expect(safeExportName('CON')).toBe('CON_')
    expect(safeExportName('lpt1')).toBe('lpt1_')
    expect(safeExportName('Console')).toBe('Console')
  })

  it('limita o tamanho e tem um nome padrão', () => {
    expect(safeExportName('x'.repeat(300))).toHaveLength(80)
    expect(safeExportName('')).toBe('Nota')
    expect(safeExportName('???')).toBe('Nota')
    expect(safeExportName(undefined)).toBe('Nota')
  })
})

describe('anexos no Markdown', () => {
  it('lista imagens e anexos sem repetir', () => {
    const doc = docOf(
      '<img src="notas://anexos/aaaaaaaa-a.png"><div data-attachment data-src="notas://anexos/bbbbbbbb-b.pdf" data-name="b.pdf"></div><img src="notas://anexos/aaaaaaaa-a.png">',
    )
    expect(assetSources(doc)).toEqual(['notas://anexos/aaaaaaaa-a.png', 'notas://anexos/bbbbbbbb-b.pdf'])
  })

  it('tira o prefixo aleatório e numera nomes repetidos', () => {
    expect(assetFileNames(['a1b2c3d4-foto.png', 'ffffffff-foto.png', '12345678-Foto.png', 'leia.txt'])).toEqual([
      'foto.png',
      'foto (2).png',
      'Foto (3).png',
      'leia.txt',
    ])
  })
})

describe('toMarkdown', () => {
  it('títulos e marcas de texto', () => {
    expect(md('<h1>Título</h1><h2>Seção</h2><h3>Sub</h3>')).toBe('# Título\n\n## Seção\n\n### Sub\n')
    expect(md('<p><strong>n</strong> <em>i</em> <s>t</s> <u>s</u> <code>c</code></p>')).toBe('**n** *i* ~~t~~ <u>s</u> `c`\n')
  })

  it('deixa espaços fora das marcas', () => {
    expect(md('<p>a<strong> negrito </strong>b</p>')).toBe('a **negrito** b\n')
  })

  it('links', () => {
    expect(md('<p><a href="https://exemplo.com/a b">site</a></p>')).toBe('[site](https://exemplo.com/a%20b)\n')
    expect(md('<p><a href="https://exemplo.com/a%20b">site</a></p>')).toBe('[site](https://exemplo.com/a%20b)\n')
  })

  it('escapa caracteres de formatação do texto', () => {
    expect(md('<p># não é título *nem* [link]</p>')).toBe('\\# não é título \\*nem\\* \\[link\\]\n')
    expect(md('<p>1. não é lista</p><p>- nem esta</p>')).toBe('1\\. não é lista\n\n\\- nem esta\n')
  })

  it('código com crase dentro usa mais crases', () => {
    expect(md('<p><code>a`b</code></p>')).toBe('``a`b``\n')
    expect(md('<pre><code class="language-js">let a = 1\n```</code></pre>')).toBe('````js\nlet a = 1\n```\n````\n')
  })

  it('quebra de linha dentro do parágrafo', () => {
    expect(md('<p>linha 1<br>linha 2</p>')).toBe('linha 1\\\nlinha 2\n')
  })

  it('listas com marcadores, numeradas e aninhadas', () => {
    expect(md('<ul><li><p>a</p><ul><li><p>a1</p></li></ul></li><li><p>b</p></li></ul>')).toBe('- a\n  - a1\n- b\n')
    expect(md('<ol start="3"><li><p>três</p></li><li><p>quatro</p></li></ol>')).toBe('3. três\n4. quatro\n')
  })

  it('lista de verificação', () => {
    const html =
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>feito</p></li><li data-type="taskItem" data-checked="false"><p>falta</p></li></ul>'
    expect(md(html)).toBe('- [x] feito\n- [ ] falta\n')
  })

  it('citação', () => {
    expect(md('<blockquote><p>um</p><p>dois</p></blockquote>')).toBe('> um\n>\n> dois\n')
  })

  it('tabela: a primeira linha vira cabeçalho e | é escapado', () => {
    const html = '<table><tr><td><p>Item</p></td><td><p>A|B</p></td></tr><tr><td><p>1</p></td><td><p></p></td></tr></table>'
    expect(md(html)).toBe('| Item | A\\|B |\n| --- | --- |\n| 1 |   |\n')
  })

  it('imagens e anexos apontam para a pasta ao lado, com espaços codificados', () => {
    const html =
      '<img src="notas://anexos/aaaaaaaa-foto.png" alt="foto.png"><div data-attachment data-src="notas://anexos/bbbbbbbb-doc.pdf" data-name="doc.pdf"></div>'
    const paths = { 'notas://anexos/aaaaaaaa-foto.png': 'Minha nota.assets/foto.png', 'notas://anexos/bbbbbbbb-doc.pdf': 'Minha nota.assets/doc.pdf' }
    expect(md(html, { assetPath: (src) => paths[src] })).toBe(
      '![foto.png](Minha%20nota.assets/foto.png)\n\n[📎 doc.pdf](Minha%20nota.assets/doc.pdf)\n',
    )
  })

  it('anexo que não foi copiado vira só o nome', () => {
    const html = '<img src="notas://anexos/x.png" alt="foto.png"><div data-attachment data-src="notas://anexos/y.pdf" data-name="doc.pdf"></div>'
    expect(md(html)).toBe('*[foto.png]*\n\n📎 doc.pdf\n')
  })

  it('ignora parágrafos vazios e nota vazia', () => {
    expect(md('<p>a</p><p></p><p></p><p>b</p>')).toBe('a\n\nb\n')
    expect(md('')).toBe('')
  })
})

describe('toPlainText', () => {
  it('mantém as linhas como na nota', () => {
    expect(txt('<h1>Compras</h1><p></p><p><strong>pão</strong> e leite</p>')).toBe('Compras\n\npão e leite\n')
  })

  it('listas, checklist e citação', () => {
    expect(txt('<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul>')).toBe('• a\n  • b\n')
    expect(txt('<ol><li><p>um</p></li><li><p>dois</p></li></ol>')).toBe('1. um\n2. dois\n')
    expect(
      txt('<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>sim</p></li><li data-type="taskItem" data-checked="false"><p>não</p></li></ul>'),
    ).toBe('[x] sim\n[ ] não\n')
    expect(txt('<blockquote><p>frase</p></blockquote>')).toBe('> frase\n')
  })

  it('tabela com tabulação, imagem e anexo', () => {
    expect(txt('<table><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></table>')).toBe('a\tb\n1\t2\n')
    expect(txt('<img src="notas://anexos/x.png" alt="foto.png">')).toBe('[Imagem: foto.png]\n')
    expect(txt('<div data-attachment data-src="notas://anexos/y.pdf" data-name="doc.pdf"></div>')).toBe('📎 doc.pdf\n')
  })
})

describe('buildPrintHtml', () => {
  it('escapa o título e bloqueia scripts e internet', () => {
    const page = buildPrintHtml({ title: '<script>x</script>', html: '<p>oi</p>' })
    expect(page).toContain('<title>&lt;script&gt;x&lt;/script&gt;</title>')
    expect(page).toContain("default-src 'none'")
    expect(page).toContain('<body><p>oi</p></body>')
  })
})
