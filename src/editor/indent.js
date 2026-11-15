import { Extension } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { codeBlockLineRange } from './docText.js'

const MAX_INDENT = 6
const INDENT_STEP = '  '

function indentCodeBlock(state, dispatch, delta) {
  const { $from, $to } = state.selection
  if ($from.parent.type.name !== 'codeBlock' || !$from.sameParent($to)) return false

  const blockStart = $from.start()
  const text = $from.parent.textContent
  const relFrom = $from.pos - blockStart
  const relTo = $to.pos - blockStart
  const { start, end } = codeBlockLineRange(text, relFrom, relTo)
  const chunk = text.slice(start, end)
  const lines = chunk.split('\n')

  let newFrom = relFrom
  let newTo = relTo
  let offsetAcc = start
  let prevDiffs = 0

  const nextLines = lines.map((line, i) => {
    let next = line
    let diff = 0
    if (delta > 0) {
      next = INDENT_STEP + line
      diff = INDENT_STEP.length
    } else {
      const m = line.match(/^ {1,2}|^\t/)
      if (m) {
        next = line.slice(m[0].length)
        diff = -m[0].length
      }
    }
    const lineStart = offsetAcc
    const lineNewStart = lineStart + prevDiffs
    if (i === 0 && relFrom >= lineStart) newFrom = Math.max(lineNewStart, relFrom + diff)
    if (relTo >= lineStart) newTo = Math.max(lineNewStart, relTo + prevDiffs + diff)
    prevDiffs += diff
    offsetAcc += line.length + 1
    return next
  })

  if (!dispatch) return true
  const replaced = nextLines.join('\n')
  if (replaced === chunk) return true
  const tr = state.tr.insertText(replaced, blockStart + start, blockStart + end)
  tr.setSelection(TextSelection.create(tr.doc, blockStart + newFrom, blockStart + newTo))
  dispatch(tr.scrollIntoView())
  return true
}

function adjustParagraphIndent(state, dispatch, delta) {
  const { from, to } = state.selection
  const tr = state.tr
  let changed = false

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return
    const cur = Number(node.attrs.indent) || 0
    const next = Math.max(0, Math.min(MAX_INDENT, cur + delta))
    if (next !== cur) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next })
      changed = true
    }
  })

  if (changed && dispatch) dispatch(tr.scrollIntoView())
  return changed
}

export const Indent = Extension.create({
  name: 'indent',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => Number(el.getAttribute('data-indent')) || 0,
            renderHTML: (attrs) =>
              attrs.indent ? { 'data-indent': String(attrs.indent), style: `margin-left: ${attrs.indent * 24}px` } : {},
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      indent:
        () =>
        ({ editor, state, dispatch }) => {
          if (!editor.isEditable) return false
          if (state.selection.$from.parent.type.name === 'codeBlock') {
            return indentCodeBlock(state, dispatch, 1)
          }
          if (editor.isActive('taskItem') && editor.commands.sinkListItem('taskItem')) return true
          if (editor.isActive('listItem') && editor.commands.sinkListItem('listItem')) return true
          return adjustParagraphIndent(state, dispatch, 1)
        },
      outdent:
        () =>
        ({ editor, state, dispatch }) => {
          if (!editor.isEditable) return false
          if (state.selection.$from.parent.type.name === 'codeBlock') {
            return indentCodeBlock(state, dispatch, -1)
          }
          if (editor.isActive('taskItem') && editor.commands.liftListItem('taskItem')) return true
          if (editor.isActive('listItem') && editor.commands.liftListItem('listItem')) return true
          return adjustParagraphIndent(state, dispatch, -1)
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-]': () => this.editor.commands.indent(),
      'Mod-[': () => this.editor.commands.outdent(),
    }
  },
})
