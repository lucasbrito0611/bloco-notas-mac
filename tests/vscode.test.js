// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import { Slice } from '@tiptap/pm/model'
import { buildExtensions } from '../src/editor/extensions.js'
import { multiCursorPluginKey } from '../src/editor/multiCursor.js'
import { noteSearchPluginKey } from '../src/editor/search.js'

let editor
const copied = []
const create = (content = '', opts = {}) => {
  copied.length = 0
  editor = new Editor({
    extensions: buildExtensions({
      onFiles: () => {},
      onCopyLine: (t) => copied.push(t),
      ...opts,
    }),
    content,
  })
  return editor
}

const text = () => editor.getText({ blockSeparator: '\n' })

const typeAtMulti = (str) => {
  const handled = editor.view.someProp('handleTextInput', (fn) => fn(editor.view, editor.state.selection.from, editor.state.selection.to, str))
  expect(handled).toBe(true)
}

const pressKey = (key, mods = {}) => {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods })
  return editor.view.someProp('handleKeyDown', (fn) => fn(editor.view, ev))
}

afterEach(() => editor?.destroy())

describe('edição de linhas e blocos (VS Code)', () => {
  it('move parágrafos para cima e para baixo preservando o cursor', () => {
    create('<p>Primeiro</p><p>Segundo</p><p>Terceiro</p>')
    editor.commands.setTextSelection(13) // dentro de "Segundo"
    editor.commands.moveLinesDown()
    expect(text()).toBe('Primeiro\nTerceiro\nSegundo')
    // Cursor continua dentro de "Segundo"
    expect(editor.state.doc.resolve(editor.state.selection.from).parent.textContent).toBe('Segundo')

    editor.commands.moveLinesUp()
    expect(text()).toBe('Primeiro\nSegundo\nTerceiro')
  })

  it('move itens de checklist dentro da lista sem quebrar a marcação', () => {
    create('<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Feito</p></li><li data-type="taskItem" data-checked="false"><p>Fazer</p></li></ul>')
    editor.commands.setTextSelection(4) // "Feito"
    editor.commands.moveLinesDown()
    expect(text().replace(/\n+/g, '\n').trim()).toBe('Fazer\nFeito')
    expect(editor.getHTML()).toContain('data-checked="true"')
  })

  it('duplica linha abaixo e acima (Alt+Shift+↓ / ↑)', () => {
    create('<p>Alpha</p><p>Beta</p>')
    editor.commands.setTextSelection(3) // dentro de "Alpha"
    editor.commands.duplicateLinesDown()
    expect(text()).toBe('Alpha\nAlpha\nBeta')
    // Na duplicação para baixo, o cursor vai para a cópia de baixo
    expect(editor.state.selection.from).toBeGreaterThan(8)

    editor.commands.duplicateLinesUp()
    expect(text()).toBe('Alpha\nAlpha\nAlpha\nBeta')
  })

  it('apaga a linha inteira (Ctrl+Shift+K) e mantém documento válido ao apagar a única linha', () => {
    create('<p>Um</p><p>Dois</p>')
    editor.commands.setTextSelection(2)
    editor.commands.deleteLines()
    expect(text()).toBe('Dois')

    editor.commands.deleteLines()
    expect(text()).toBe('')
    expect(editor.getHTML()).toBe('<p></p>')
  })

  it('insere linha abaixo e acima sem partir o texto no meio (Ctrl+Enter / Ctrl+Shift+Enter)', () => {
    create('<p>Olá mundo</p>')
    editor.commands.setTextSelection(4) // entre "Olá" e " mundo"
    editor.commands.insertLineBelow()
    expect(text()).toBe('Olá mundo\n')

    editor.commands.setTextSelection(4)
    editor.commands.insertLineAbove()
    expect(text()).toBe('\nOlá mundo\n')
  })

  it('insere novo item de checklist com Ctrl+Enter dentro de uma tarefa', () => {
    create('<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Item 1</p></li></ul>')
    editor.commands.setTextSelection(5)
    editor.commands.insertLineBelow()
    expect(editor.getHTML().match(/data-type="taskItem"/g)).toHaveLength(2)
  })

  it('Ctrl+L seleciona a linha inteira e estende para as próximas linhas a cada toque', () => {
    create('<p>Linha 1</p><p>Linha 2</p><p>Linha 3</p>')
    editor.commands.setTextSelection(3)
    editor.commands.selectLine()
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe('Linha 1')

    editor.commands.selectLine()
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, '\n')).toBe('Linha 1\nLinha 2')
  })

  it('Ctrl+C e Ctrl+X sem seleção copiam e recortam a linha inteira', () => {
    create('<p>Primeira</p><p>Segunda</p>')
    editor.commands.setTextSelection(4)
    expect(editor.commands.copyCurrentLineIfEmpty()).toBe(true)
    expect(copied).toEqual(['Primeira'])
    expect(text()).toBe('Primeira\nSegunda')

    expect(editor.commands.cutCurrentLineIfEmpty()).toBe(true)
    expect(copied).toEqual(['Primeira', 'Primeira'])
    expect(text()).toBe('Segunda')

    // Com seleção ativa, devolve false para o navegador copiar normalmente
    editor.commands.setTextSelection({ from: 1, to: 4 })
    expect(editor.commands.copyCurrentLineIfEmpty()).toBe(false)
  })

  it('opera sobre linhas individuais dentro de blocos de código', () => {
    create('<pre><code>um\ndois\ntres</code></pre>')
    editor.commands.setTextSelection(5) // "dois"
    editor.commands.moveLinesUp()
    expect(text().trim()).toBe('dois\num\ntres')

    editor.commands.duplicateLinesDown()
    expect(text().trim()).toBe('dois\ndois\num\ntres')

    editor.commands.deleteLines()
    expect(text().trim()).toBe('dois\num\ntres')
  })

  it('expande e encolhe a seleção passo a passo respeitando acentos (Alt+Shift+→ / ←)', () => {
    create('<p>Uma <b>ação rápida</b> aqui</p>')
    editor.commands.setTextSelection(7) // dentro de "ação"
    editor.commands.expandSelection()
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe('ação')

    editor.commands.expandSelection()
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe('ação rápida')

    editor.commands.expandSelection()
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe('Uma ação rápida aqui')

    editor.commands.shrinkSelection()
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe('ação rápida')

    editor.commands.shrinkSelection()
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe('ação')
  })

  it('ignora comandos que alteram texto quando a nota está somente leitura (lixeira)', () => {
    create('<p>Um</p><p>Dois</p>')
    editor.setEditable(false, false)
    editor.commands.setTextSelection(2)
    expect(editor.commands.moveLinesDown()).toBe(false)
    expect(editor.commands.deleteLines()).toBe(false)
    expect(editor.commands.insertLineBelow()).toBe(false)
    expect(text()).toBe('Um\nDois')
  })
})

describe('recuo (Ctrl+] / Ctrl+[)', () => {
  it('aumenta e diminui recuo em parágrafos sem sujar HTML quando zero', () => {
    create('<p>Parágrafo</p>')
    editor.commands.setTextSelection(2)
    editor.commands.indent()
    expect(editor.getHTML()).toContain('data-indent="1"')
    editor.commands.outdent()
    expect(editor.getHTML()).toBe('<p>Parágrafo</p>')
  })

  it('indenta e desindenta linhas dentro de bloco de código', () => {
    create('<pre><code>linha1\nlinha2</code></pre>')
    editor.commands.setTextSelection({ from: 2, to: 10 })
    editor.commands.indent()
    expect(text().trimEnd()).toBe('  linha1\n  linha2')
    editor.commands.outdent()
    expect(text().trimEnd()).toBe('linha1\nlinha2')
  })
})

describe('múltiplos cursores e ocorrências', () => {
  it('Ctrl+D seleciona palavra com acento, soma próximas ocorrências (até com negrito) e edita tudo de uma vez', () => {
    create('<p>Tomar café agora</p><p>Mais <b>ca</b>fé depois</p><p>Café gelado</p>')
    editor.commands.setTextSelection(9) // dentro de "café"
    editor.commands.selectNextOccurrence()
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe('café')

    editor.commands.selectNextOccurrence()
    editor.commands.selectNextOccurrence()
    const st = multiCursorPluginKey.getState(editor.state)
    expect(st.ranges).toHaveLength(3)

    typeAtMulti('chá')
    expect(text()).toBe('Tomar chá agora\nMais chá depois\nchá gelado')

    // Um único Ctrl+Z desfaz todas as substituições
    editor.commands.undo()
    expect(text()).toBe('Tomar café agora\nMais café depois\nCafé gelado')
  })

  it('Ctrl+K seguido de Ctrl+D pula a ocorrência atual para a seguinte', () => {
    create('<p>a x b x c x</p>')
    editor.commands.setTextSelection({ from: 3, to: 4 }) // primeiro "x"
    editor.commands.selectNextOccurrence() // agora tem [1º x, 2º x]
    pressKey('k', { ctrlKey: true })
    pressKey('d', { ctrlKey: true }) // pula o 2º x e vai para o 3º x
    typeAtMulti('Y')
    expect(text()).toBe('a Y b x c Y')
  })

  it('Ctrl+Alt+L seleciona todas as ocorrências e Ctrl+Alt+U desfaz o último cursor', () => {
    create('<p>item 1</p><p>item 2</p><p>item 3</p>')
    editor.commands.setTextSelection(2)
    editor.commands.selectAllOccurrences()
    expect(multiCursorPluginKey.getState(editor.state).ranges).toHaveLength(3)

    editor.commands.undoLastCursor()
    expect(multiCursorPluginKey.getState(editor.state).ranges).toHaveLength(0)
  })

  it('Ctrl+Alt+↓ adiciona cursores verticais e Backspace/Delete/Setas funcionam juntos', () => {
    create('<p>abc</p><p>def</p><p>ghi</p>')
    editor.commands.setTextSelection(2) // após "a"
    editor.commands.addCursorBelow()
    editor.commands.addCursorBelow()
    expect(multiCursorPluginKey.getState(editor.state).ranges).toHaveLength(3)

    pressKey('Backspace')
    expect(text()).toBe('bc\nef\nhi')

    pressKey('Delete')
    expect(text()).toBe('c\nf\ni')

    pressKey('End')
    typeAtMulti('!')
    expect(text()).toBe('c!\nf!\ni!')

    editor.commands.clearMultiCursors()
    expect(multiCursorPluginKey.getState(editor.state).ranges).toHaveLength(0)
  })

  it('Alt+Shift+I coloca cursor no fim de cada linha selecionada e cola linha por cursor', () => {
    create('<p>um</p><p>dois</p><p>tres</p>')
    editor.commands.setTextSelection({ from: 1, to: 14 })
    editor.commands.addCursorsToLineEnds()
    expect(multiCursorPluginKey.getState(editor.state).ranges).toHaveLength(3)

    const ev = {
      clipboardData: { getData: () => ':1\n:2\n:3' },
      preventDefault: vi.fn(),
    }
    const handled = editor.view.someProp('handlePaste', (fn) => fn(editor.view, ev, Slice.empty))
    expect(handled).toBe(true)
    expect(text()).toBe('um:1\ndois:2\ntres:3')
  })
})

describe('localizar e substituir na nota (Ctrl+F / Ctrl+H)', () => {
  it('encontra ocorrências, navega e substitui respeitando Undo único em Substituir Tudo', () => {
    create('<p>Casa azul</p><p><b>ca</b>sa grande</p><p>outra CASA</p>')
    editor.commands.setTextSelection(1)
    editor.commands.setNoteSearch('casa', false)

    let st = noteSearchPluginKey.getState(editor.state)
    expect(st.matches).toHaveLength(3)
    expect(st.activeIndex).toBe(0)

    editor.commands.nextNoteMatch()
    expect(noteSearchPluginKey.getState(editor.state).activeIndex).toBe(1)

    editor.commands.prevNoteMatch()
    expect(noteSearchPluginKey.getState(editor.state).activeIndex).toBe(0)

    editor.commands.replaceNoteMatch('Lar')
    expect(text()).toBe('Lar azul\ncasa grande\noutra CASA')

    editor.commands.setNoteSearch('casa', true)
    expect(noteSearchPluginKey.getState(editor.state).matches).toHaveLength(1)

    editor.commands.setNoteSearch('casa', false)
    editor.commands.replaceAllNoteMatches('casa-nova')
    expect(text()).toBe('Lar azul\ncasa-nova grande\noutra casa-nova')

    editor.commands.undo()
    expect(text()).toBe('Lar azul\ncasa grande\noutra CASA')
  })
})
