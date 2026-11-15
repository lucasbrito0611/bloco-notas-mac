import { Extension } from '@tiptap/core'
import { Fragment } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { codeBlockLineRange, wordRangeAt } from './docText.js'

export const expandSelectionPluginKey = new PluginKey('expandSelection')

const UNIT_CONTAINER_TYPES = new Set(['bulletList', 'orderedList', 'taskList', 'table', 'doc'])

function unitRange(state) {
  const { $from, $to } = state.selection
  return $from.blockRange($to, (node) => UNIT_CONTAINER_TYPES.has(node.type.name))
}

function collectNodes(parent, startIndex, endIndex) {
  const nodes = []
  for (let i = startIndex; i < endIndex; i++) nodes.push(parent.child(i))
  return nodes
}

function moveCodeBlockLines(state, dispatch, dir) {
  const { $from, $to } = state.selection
  if ($from.parent.type.name !== 'codeBlock' || !$from.sameParent($to)) return false
  const blockStart = $from.start()
  const text = $from.parent.textContent
  const relFrom = $from.pos - blockStart
  const relTo = $to.pos - blockStart
  const { start, end } = codeBlockLineRange(text, relFrom, relTo)

  if (dir < 0) {
    if (start === 0) return true
    const prevStart = text.lastIndexOf('\n', start - 2) + 1
    const prevLine = text.slice(prevStart, start - 1)
    const block = text.slice(start, end)
    const nextText = text.slice(0, prevStart) + block + '\n' + prevLine + text.slice(end)
    if (!dispatch) return true
    const shift = -(prevLine.length + 1)
    const tr = state.tr.insertText(nextText, blockStart, blockStart + text.length)
    tr.setSelection(TextSelection.create(tr.doc, $from.pos + shift, $to.pos + shift))
    dispatch(tr.scrollIntoView())
    return true
  }

  if (end >= text.length) return true
  const nextBreak = text.indexOf('\n', end + 1)
  const nextEnd = nextBreak === -1 ? text.length : nextBreak
  const nextLine = text.slice(end + 1, nextEnd)
  const block = text.slice(start, end)
  const nextText = text.slice(0, start) + nextLine + '\n' + block + text.slice(nextEnd)
  if (!dispatch) return true
  const shift = nextLine.length + 1
  const tr = state.tr.insertText(nextText, blockStart, blockStart + text.length)
  tr.setSelection(TextSelection.create(tr.doc, $from.pos + shift, $to.pos + shift))
  dispatch(tr.scrollIntoView())
  return true
}

function duplicateCodeBlockLines(state, dispatch, dir) {
  const { $from, $to } = state.selection
  if ($from.parent.type.name !== 'codeBlock' || !$from.sameParent($to)) return false
  const blockStart = $from.start()
  const text = $from.parent.textContent
  const relFrom = $from.pos - blockStart
  const relTo = $to.pos - blockStart
  const { start, end } = codeBlockLineRange(text, relFrom, relTo)
  const chunk = text.slice(start, end)
  const nextText = text.slice(0, end) + '\n' + chunk + text.slice(end)
  if (!dispatch) return true
  const shift = dir > 0 ? chunk.length + 1 : 0
  const tr = state.tr.insertText(nextText, blockStart, blockStart + text.length)
  tr.setSelection(TextSelection.create(tr.doc, $from.pos + shift, $to.pos + shift))
  dispatch(tr.scrollIntoView())
  return true
}

function deleteCodeBlockLines(state, dispatch) {
  const { $from, $to } = state.selection
  if ($from.parent.type.name !== 'codeBlock' || !$from.sameParent($to)) return false
  const blockStart = $from.start()
  const text = $from.parent.textContent
  const relFrom = $from.pos - blockStart
  const relTo = $to.pos - blockStart
  const { start, end } = codeBlockLineRange(text, relFrom, relTo)
  if (!dispatch) return true

  let nextText
  let cursorRel
  if (end < text.length) {
    nextText = text.slice(0, start) + text.slice(end + 1)
    cursorRel = start
  } else if (start > 0) {
    nextText = text.slice(0, start - 1)
    const prevStart = nextText.lastIndexOf('\n') + 1
    cursorRel = prevStart
  } else {
    nextText = ''
    cursorRel = 0
  }

  const tr = state.tr.insertText(nextText, blockStart, blockStart + text.length)
  tr.setSelection(TextSelection.create(tr.doc, blockStart + cursorRel))
  dispatch(tr.scrollIntoView())
  return true
}

function moveSiblingBlocks(state, dispatch, dir) {
  const range = unitRange(state)
  if (!range) return false
  const { parent, startIndex, endIndex, start, end } = range
  const { anchor, head } = state.selection

  if (dir < 0) {
    if (startIndex === 0) return true
    if (!dispatch) return true
    const prevNode = parent.child(startIndex - 1)
    const prevStart = start - prevNode.nodeSize
    const frag = Fragment.from(collectNodes(parent, startIndex, endIndex))
    const tr = state.tr.delete(start, end).insert(prevStart, frag)
    tr.setSelection(TextSelection.create(tr.doc, anchor - prevNode.nodeSize, head - prevNode.nodeSize))
    dispatch(tr.scrollIntoView())
    return true
  }

  if (endIndex >= parent.childCount) return true
  if (!dispatch) return true
  const nextNode = parent.child(endIndex)
  const insertPos = end + nextNode.nodeSize
  const frag = Fragment.from(collectNodes(parent, startIndex, endIndex))
  const tr = state.tr.insert(insertPos, frag).delete(start, end)
  tr.setSelection(TextSelection.create(tr.doc, anchor + nextNode.nodeSize, head + nextNode.nodeSize))
  dispatch(tr.scrollIntoView())
  return true
}

function duplicateSiblingBlocks(state, dispatch, dir) {
  const range = unitRange(state)
  if (!range) return false
  const { parent, startIndex, endIndex, start, end } = range
  if (!dispatch) return true
  const frag = Fragment.from(collectNodes(parent, startIndex, endIndex))
  const size = end - start
  const { anchor, head } = state.selection
  const tr = state.tr.insert(end, frag)
  const shift = dir > 0 ? size : 0
  tr.setSelection(TextSelection.create(tr.doc, anchor + shift, head + shift))
  dispatch(tr.scrollIntoView())
  return true
}

function deleteSiblingBlocks(state, dispatch) {
  const range = unitRange(state)
  if (!range) return false
  const { parent, startIndex, endIndex, start, end, depth } = range
  if (!dispatch) return true
  const { schema } = state
  const tr = state.tr

  if (startIndex === 0 && endIndex === parent.childCount) {
    if (parent.type.name === 'doc') {
      tr.replaceWith(0, tr.doc.content.size, schema.nodes.paragraph.create())
      tr.setSelection(TextSelection.create(tr.doc, 1))
      dispatch(tr.scrollIntoView())
      return true
    }
    const containerPos = range.$from.before(depth)
    const containerEnd = containerPos + parent.nodeSize
    if (tr.doc.childCount === 1) {
      tr.replaceWith(0, tr.doc.content.size, schema.nodes.paragraph.create())
      tr.setSelection(TextSelection.create(tr.doc, 1))
    } else {
      tr.delete(containerPos, containerEnd)
      const safe = Math.min(containerPos, tr.doc.content.size)
      tr.setSelection(TextSelection.near(tr.doc.resolve(safe), 1))
    }
    dispatch(tr.scrollIntoView())
    return true
  }

  tr.delete(start, end)
  const safe = Math.min(start, tr.doc.content.size)
  tr.setSelection(TextSelection.near(tr.doc.resolve(safe), start >= tr.doc.content.size ? -1 : 1))
  dispatch(tr.scrollIntoView())
  return true
}

function insertEmptyLine(state, dispatch, dir) {
  const { $from, $to } = state.selection
  if ($from.parent.type.name === 'codeBlock' && $from.sameParent($to)) {
    const blockStart = $from.start()
    const text = $from.parent.textContent
    const { start, end } = codeBlockLineRange(text, $from.pos - blockStart, $to.pos - blockStart)
    const insertAt = dir > 0 ? blockStart + end : blockStart + start
    if (!dispatch) return true
    const tr = state.tr.insertText('\n', insertAt)
    const cursorPos = dir > 0 ? insertAt + 1 : insertAt
    tr.setSelection(TextSelection.create(tr.doc, cursorPos))
    dispatch(tr.scrollIntoView())
    return true
  }

  const range = unitRange(state)
  if (!range) return false
  const { parent, startIndex, endIndex, start, end } = range
  const refNode = parent.child(dir > 0 ? endIndex - 1 : startIndex)
  const { schema } = state

  let newNode
  let cursorOffset = 1
  if (refNode.type.name === 'taskItem') {
    newNode = schema.nodes.taskItem.create({ checked: false }, schema.nodes.paragraph.create())
    cursorOffset = 2
  } else if (refNode.type.name === 'listItem') {
    newNode = schema.nodes.listItem.create(null, schema.nodes.paragraph.create())
    cursorOffset = 2
  } else if (refNode.type.name === 'tableRow') {
    const cells = []
    refNode.forEach((cell) => {
      cells.push(cell.type.createAndFill())
    })
    newNode = schema.nodes.tableRow.create(null, cells)
    cursorOffset = 3
  } else {
    newNode = schema.nodes.paragraph.create()
  }

  if (!dispatch) return true
  const insertPos = dir > 0 ? end : start
  const tr = state.tr.insert(insertPos, newNode)
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + cursorOffset), 1))
  dispatch(tr.scrollIntoView())
  return true
}

function nextTextblockStartAfter(doc, pos) {
  let found = null
  doc.nodesBetween(pos, doc.content.size, (node, nodePos) => {
    if (found !== null) return false
    if (node.isTextblock && nodePos + 1 > pos) {
      found = nodePos + 1
      return false
    }
    return true
  })
  return found
}

function nextTextblockEndAfter(doc, pos) {
  let found = null
  doc.nodesBetween(pos, doc.content.size, (node, nodePos) => {
    if (found !== null) return false
    if (node.isTextblock && nodePos + 1 + node.content.size > pos) {
      found = nodePos + 1 + node.content.size
      return false
    }
    return true
  })
  return found
}

function selectCurrentOrNextLine(state, dispatch) {
  const { $from, $to, from, to } = state.selection
  if ($from.parent.type.name === 'codeBlock' && $from.sameParent($to)) {
    const blockStart = $from.start()
    const text = $from.parent.textContent
    const relFrom = from - blockStart
    const relTo = to - blockStart
    const { start, end } = codeBlockLineRange(text, relFrom, relTo)
    let nextTo = end
    if (relFrom === start && relTo >= end) {
      if (end < text.length) {
        const afterNext = text.indexOf('\n', end + 1)
        nextTo = afterNext === -1 ? text.length : afterNext
      }
    }
    if (!dispatch) return true
    const tr = state.tr.setSelection(TextSelection.create(state.doc, blockStart + start, blockStart + nextTo))
    dispatch(tr.scrollIntoView())
    return true
  }

  if (!$from.parent.isTextblock) return false
  const lineStart = $from.start()
  const lineEnd = $to.parent.isTextblock ? $to.end() : $from.end()

  let targetFrom = from
  let targetTo = to

  if (from > lineStart || to < lineEnd) {
    targetFrom = lineStart
    targetTo = lineEnd
    if (targetFrom === targetTo) {
      const nextStart = nextTextblockStartAfter(state.doc, targetTo)
      if (nextStart !== null) targetTo = nextStart
    }
  } else if (from === to) {
    const nextStart = nextTextblockStartAfter(state.doc, to)
    targetFrom = lineStart
    targetTo = nextStart ?? lineEnd
  } else {
    const nextEnd = nextTextblockEndAfter(state.doc, to)
    if (nextEnd !== null) {
      targetFrom = from
      targetTo = nextEnd
    } else {
      targetFrom = lineStart
      targetTo = lineEnd
    }
  }

  if (!dispatch) return true
  const tr = state.tr.setSelection(TextSelection.create(state.doc, targetFrom, targetTo))
  dispatch(tr.scrollIntoView())
  return true
}

function currentLinePlainText(state) {
  const { $from } = state.selection
  if ($from.parent.type.name === 'codeBlock') {
    const blockStart = $from.start()
    const text = $from.parent.textContent
    const { start, end } = codeBlockLineRange(text, $from.pos - blockStart)
    return text.slice(start, end)
  }
  if ($from.parent.isTextblock) return $from.parent.textContent
  return ''
}

function copyTextToClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {})
  }
}

function markRangeAt($pos, markType) {
  const parent = $pos.parent
  if (!parent.isTextblock) return null
  const start = $pos.start()
  let offset = 0
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i)
    const childFrom = start + offset
    const childTo = childFrom + child.nodeSize
    offset += child.nodeSize
    if ($pos.pos >= childFrom && $pos.pos <= childTo && markType.isInSet(child.marks)) {
      let from = childFrom
      let to = childTo
      // Agrupa nós adjacentes com a mesma marca.
      let backOffset = childFrom - start
      for (let j = i - 1; j >= 0; j--) {
        const prev = parent.child(j)
        if (!markType.isInSet(prev.marks)) break
        backOffset -= prev.nodeSize
        from = start + backOffset
      }
      let fwdOffset = childTo - start
      for (let j = i + 1; j < parent.childCount; j++) {
        const next = parent.child(j)
        if (!markType.isInSet(next.marks)) break
        fwdOffset += next.nodeSize
        to = start + fwdOffset
      }
      return { from, to }
    }
  }
  return null
}

function expandSelectionCmd(state, dispatch) {
  const { from, to, $from } = state.selection
  const candidates = []

  if (from === to) {
    const word = wordRangeAt(state.doc, from)
    if (word) candidates.push({ from: word.from, to: word.to })
  }

  const $markPos = from < to ? state.doc.resolve(Math.min(from + 1, to)) : $from
  for (const mark of $markPos.marks()) {
    const mr = markRangeAt($markPos, mark.type)
    if (mr) candidates.push(mr)
  }

  if ($from.parent.type.name === 'codeBlock') {
    const blockStart = $from.start()
    const { start, end } = codeBlockLineRange($from.parent.textContent, from - blockStart, to - blockStart)
    candidates.push({ from: blockStart + start, to: blockStart + end })
  }

  if ($from.parent.isTextblock) {
    candidates.push({ from: $from.start(), to: $from.end() })
  }

  for (let d = $from.depth; d >= 1; d--) {
    candidates.push({ from: $from.start(d), to: $from.end(d) })
  }

  candidates.push({ from: 0, to: state.doc.content.size })

  const next = candidates.find((c) => c.from <= from && c.to >= to && (c.from < from || c.to > to))
  if (!next) return false
  if (!dispatch) return true

  const pluginState = expandSelectionPluginKey.getState(state) || { history: [] }
  const tr = state.tr
    .setSelection(TextSelection.create(state.doc, next.from, next.to))
    .setMeta(expandSelectionPluginKey, { history: [...pluginState.history, { from, to }] })
  dispatch(tr.scrollIntoView())
  return true
}

function shrinkSelectionCmd(state, dispatch) {
  const pluginState = expandSelectionPluginKey.getState(state)
  if (!pluginState?.history.length) return false
  if (!dispatch) return true
  const prev = pluginState.history[pluginState.history.length - 1]
  const tr = state.tr
    .setSelection(TextSelection.create(state.doc, prev.from, prev.to))
    .setMeta(expandSelectionPluginKey, { history: pluginState.history.slice(0, -1) })
  dispatch(tr.scrollIntoView())
  return true
}

export const VSCodeBlocks = Extension.create({
  name: 'vscodeBlocks',
  // Prioridade acima de HardBreak (100) para Ctrl+Enter inserir linha abaixo no estilo VS Code.
  priority: 200,

  addOptions() {
    return {
      isMultiCursorActive: () => false,
      onCopyLine: null,
    }
  },

  addCommands() {
    return {
      moveLinesUp:
        () =>
        ({ editor, state, dispatch }) =>
          editor.isEditable && (moveCodeBlockLines(state, dispatch, -1) || moveSiblingBlocks(state, dispatch, -1)),
      moveLinesDown:
        () =>
        ({ editor, state, dispatch }) =>
          editor.isEditable && (moveCodeBlockLines(state, dispatch, 1) || moveSiblingBlocks(state, dispatch, 1)),
      duplicateLinesUp:
        () =>
        ({ editor, state, dispatch }) =>
          editor.isEditable && (duplicateCodeBlockLines(state, dispatch, -1) || duplicateSiblingBlocks(state, dispatch, -1)),
      duplicateLinesDown:
        () =>
        ({ editor, state, dispatch }) =>
          editor.isEditable && (duplicateCodeBlockLines(state, dispatch, 1) || duplicateSiblingBlocks(state, dispatch, 1)),
      deleteLines:
        () =>
        ({ editor, state, dispatch }) =>
          editor.isEditable && (deleteCodeBlockLines(state, dispatch) || deleteSiblingBlocks(state, dispatch)),
      selectLine:
        () =>
        ({ state, dispatch }) =>
          selectCurrentOrNextLine(state, dispatch),
      insertLineBelow:
        () =>
        ({ editor, state, dispatch }) =>
          editor.isEditable && insertEmptyLine(state, dispatch, 1),
      insertLineAbove:
        () =>
        ({ editor, state, dispatch }) =>
          editor.isEditable && insertEmptyLine(state, dispatch, -1),
      expandSelection:
        () =>
        ({ state, dispatch }) =>
          expandSelectionCmd(state, dispatch),
      shrinkSelection:
        () =>
        ({ state, dispatch }) =>
          shrinkSelectionCmd(state, dispatch),
      copyCurrentLineIfEmpty:
        () =>
        ({ state }) => {
          if (this.options.isMultiCursorActive(state) || !state.selection.empty) return false
          const text = currentLinePlainText(state)
          copyTextToClipboard(text)
          this.options.onCopyLine?.(text)
          return true
        },
      cutCurrentLineIfEmpty:
        () =>
        ({ editor, state, dispatch }) => {
          if (!editor.isEditable || this.options.isMultiCursorActive(state) || !state.selection.empty) return false
          const text = currentLinePlainText(state)
          copyTextToClipboard(text)
          this.options.onCopyLine?.(text)
          return deleteCodeBlockLines(state, dispatch) || deleteSiblingBlocks(state, dispatch)
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      'Alt-ArrowUp': () => this.editor.commands.moveLinesUp(),
      'Alt-ArrowDown': () => this.editor.commands.moveLinesDown(),
      'Shift-Alt-ArrowUp': () => this.editor.commands.duplicateLinesUp(),
      'Shift-Alt-ArrowDown': () => this.editor.commands.duplicateLinesDown(),
      'Mod-Shift-k': () => this.editor.commands.deleteLines(),
      'Mod-Shift-K': () => this.editor.commands.deleteLines(),
      'Mod-l': () => this.editor.commands.selectLine(),
      'Mod-L': () => this.editor.commands.selectLine(),
      'Mod-Enter': () => this.editor.commands.insertLineBelow(),
      'Mod-Shift-Enter': () => this.editor.commands.insertLineAbove(),
      'Shift-Alt-ArrowRight': () => this.editor.commands.expandSelection(),
      'Shift-Alt-ArrowLeft': () => this.editor.commands.shrinkSelection(),
      'Mod-c': () => this.editor.commands.copyCurrentLineIfEmpty(),
      'Mod-C': () => this.editor.commands.copyCurrentLineIfEmpty(),
      'Mod-x': () => this.editor.commands.cutCurrentLineIfEmpty(),
      'Mod-X': () => this.editor.commands.cutCurrentLineIfEmpty(),
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: expandSelectionPluginKey,
        state: {
          init: () => ({ history: [] }),
          apply(tr, value) {
            const meta = tr.getMeta(expandSelectionPluginKey)
            if (meta) return meta
            if (tr.selectionSet || tr.docChanged) return { history: [] }
            return value
          },
        },
      }),
    ]
  },
})
