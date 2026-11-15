import { Extension } from '@tiptap/core'
import { canSplit } from '@tiptap/pm/transform'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { collectDocMatches, wordRangeAt } from './docText.js'

export const multiCursorPluginKey = new PluginKey('multiCursor')

const EMPTY_STATE = {
  ranges: [], // Array<{ anchor, head, from, to }>
  history: [],
  skipped: [],
  preferredCol: null,
  chord: null,
}

const makeRange = (anchor, head = anchor) => ({
  anchor,
  head,
  from: Math.min(anchor, head),
  to: Math.max(anchor, head),
})

const sameSpan = (a, b) => a.from === b.from && a.to === b.to
const overlaps = (a, b) => (a.from === a.to && b.from === b.to ? a.from === b.from : a.from < b.to && b.from < a.to)

function sortAndMergeRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => a.from - b.from || a.to - b.to)
  const merged = []
  for (const r of sorted) {
    const prev = merged[merged.length - 1]
    if (prev && (sameSpan(prev, r) || (prev.to > r.from && prev.from <= r.to))) {
      const from = Math.min(prev.from, r.from)
      const to = Math.max(prev.to, r.to)
      merged[merged.length - 1] = makeRange(from, to)
    } else if (!prev || !sameSpan(prev, r)) {
      merged.push(r)
    }
  }
  return merged
}

function collectDocLines(doc) {
  const lines = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const contentStart = pos + 1
    if (node.type.name === 'codeBlock') {
      const text = node.textContent
      let offset = 0
      while (true) {
        const nl = text.indexOf('\n', offset)
        if (nl === -1) {
          lines.push({ lineStart: contentStart + offset, lineEnd: contentStart + text.length })
          break
        }
        lines.push({ lineStart: contentStart + offset, lineEnd: contentStart + nl })
        offset = nl + 1
      }
    } else {
      lines.push({ lineStart: contentStart, lineEnd: contentStart + node.content.size })
    }
    return false
  })
  return lines
}

function mapRangeThrough(r, mapping) {
  return makeRange(mapping.map(r.anchor, 1), mapping.map(r.head, 1))
}

function setMultiState(view, nextState, selectionRange) {
  let tr = view.state.tr.setMeta(multiCursorPluginKey, nextState)
  if (selectionRange) {
    const max = tr.doc.content.size
    const a = Math.max(0, Math.min(max, selectionRange.anchor))
    const h = Math.max(0, Math.min(max, selectionRange.head))
    tr = tr.setSelection(TextSelection.create(tr.doc, a, h))
  }
  view.dispatch(tr.scrollIntoView())
}

function pushHistory(pluginState, nativeSel) {
  return [
    ...pluginState.history,
    {
      ranges: pluginState.ranges,
      skipped: pluginState.skipped,
      preferredCol: pluginState.preferredCol,
      native: { anchor: nativeSel.anchor, head: nativeSel.head },
    },
  ]
}

function findNextUnselectedMatch(matches, afterPos, taken, skipped) {
  const isBlocked = (m) => taken.some((r) => overlaps(r, m)) || skipped.some((s) => overlaps(s, m))
  const forward = matches.find((m) => m.from >= afterPos && !isBlocked(m))
  if (forward) return forward
  return matches.find((m) => !isBlocked(m)) || null
}

function selectNextOccurrenceCmd(view) {
  const { state } = view
  const pluginState = multiCursorPluginKey.getState(state) || EMPTY_STATE
  const sel = state.selection

  // 1º Ctrl+D com cursor vazio: apenas seleciona a palavra sob o cursor.
  if (pluginState.ranges.length === 0 && sel.empty) {
    const word = wordRangeAt(state.doc, sel.from)
    if (!word) return true
    const wordRange = makeRange(word.from, word.to)
    setMultiState(
      view,
      {
        ranges: [wordRange],
        history: pushHistory(pluginState, sel),
        skipped: [],
        preferredCol: null,
        chord: null,
      },
      wordRange,
    )
    return true
  }

  const baseRanges = pluginState.ranges.length ? pluginState.ranges : [makeRange(sel.anchor, sel.head)]
  const first = baseRanges[0]
  const needle = state.doc.textBetween(first.from, first.to, '\n')
  if (!needle) return true

  const matches = collectDocMatches(state.doc, needle, { caseSensitive: false })
  const last = baseRanges[baseRanges.length - 1]
  const next = findNextUnselectedMatch(matches, last.to, baseRanges, pluginState.skipped)
  if (!next) {
    if (pluginState.chord) setMultiState(view, { ...pluginState, chord: null })
    return true
  }

  const nextRange = makeRange(next.from, next.to)
  const nextRanges = [...baseRanges, nextRange]
  setMultiState(
    view,
    {
      ranges: nextRanges,
      history: pushHistory(pluginState, sel),
      skipped: pluginState.skipped,
      preferredCol: null,
      chord: null,
    },
    nextRange,
  )
  return true
}

function skipAndSelectNextCmd(view) {
  const { state } = view
  const pluginState = multiCursorPluginKey.getState(state) || EMPTY_STATE
  const sel = state.selection
  const baseRanges = pluginState.ranges.length ? pluginState.ranges : sel.empty ? [] : [makeRange(sel.anchor, sel.head)]

  if (!baseRanges.length) {
    setMultiState(view, { ...pluginState, chord: null })
    return true
  }

  const last = baseRanges[baseRanges.length - 1]
  const needle = state.doc.textBetween(baseRanges[0].from, baseRanges[0].to, '\n')
  if (!needle) {
    setMultiState(view, { ...pluginState, chord: null })
    return true
  }

  const withoutLast = baseRanges.slice(0, -1)
  const skipped = [...pluginState.skipped, last]
  const matches = collectDocMatches(state.doc, needle, { caseSensitive: false })
  const next = findNextUnselectedMatch(matches, last.to, withoutLast, skipped)
  if (!next) {
    setMultiState(view, { ...pluginState, chord: null })
    return true
  }

  const nextRange = makeRange(next.from, next.to)
  const nextRanges = [...withoutLast, nextRange]
  setMultiState(
    view,
    {
      ranges: nextRanges,
      history: pushHistory(pluginState, sel),
      skipped,
      preferredCol: null,
      chord: null,
    },
    nextRange,
  )
  return true
}

function selectAllOccurrencesCmd(view) {
  const { state } = view
  const pluginState = multiCursorPluginKey.getState(state) || EMPTY_STATE
  const sel = state.selection
  let ref = pluginState.ranges[0] || (!sel.empty ? makeRange(sel.anchor, sel.head) : null)

  if (!ref) {
    const word = wordRangeAt(state.doc, sel.from)
    if (!word) return true
    ref = makeRange(word.from, word.to)
  }

  const needle = state.doc.textBetween(ref.from, ref.to, '\n')
  if (!needle) return true
  const matches = collectDocMatches(state.doc, needle, { caseSensitive: false }).map((m) => makeRange(m.from, m.to))
  if (!matches.length) return true

  setMultiState(
    view,
    {
      ranges: matches,
      history: pushHistory(pluginState, sel),
      skipped: [],
      preferredCol: null,
      chord: null,
    },
    matches[0],
  )
  return true
}

function addCursorVerticalCmd(view, dir) {
  const { state } = view
  const pluginState = multiCursorPluginKey.getState(state) || EMPTY_STATE
  const sel = state.selection
  const baseRanges = pluginState.ranges.length ? pluginState.ranges : [makeRange(sel.anchor, sel.head)]
  const lines = collectDocLines(state.doc)
  if (!lines.length) return true

  const sorted = [...baseRanges].sort((a, b) => a.from - b.from)
  const ref = dir < 0 ? sorted[0] : sorted[sorted.length - 1]
  const lineIdx = lines.findIndex((l) => ref.head >= l.lineStart && ref.head <= l.lineEnd)
  if (lineIdx === -1) return true

  const targetIdx = lineIdx + dir
  if (targetIdx < 0 || targetIdx >= lines.length) return true

  const preferredCol = pluginState.preferredCol ?? ref.head - lines[lineIdx].lineStart
  const target = lines[targetIdx]
  const newPos = Math.min(target.lineStart + preferredCol, target.lineEnd)
  const added = makeRange(newPos, newPos)
  const nextRanges = sortAndMergeRanges([...baseRanges, added])

  setMultiState(
    view,
    {
      ranges: nextRanges,
      history: pushHistory(pluginState, sel),
      skipped: [],
      preferredCol,
      chord: null,
    },
    added,
  )
  return true
}

function addCursorsToLineEndsCmd(view) {
  const { state } = view
  const pluginState = multiCursorPluginKey.getState(state) || EMPTY_STATE
  const sel = state.selection
  const lines = collectDocLines(state.doc)
  const touched = lines.filter((l) => l.lineEnd >= sel.from && l.lineStart <= sel.to)
  if (!touched.length) return true

  const nextRanges = touched.map((l) => makeRange(l.lineEnd, l.lineEnd))
  setMultiState(
    view,
    {
      ranges: nextRanges,
      history: pushHistory(pluginState, sel),
      skipped: [],
      preferredCol: null,
      chord: null,
    },
    nextRanges[0],
  )
  return true
}

function undoLastCursorCmd(view) {
  const { state } = view
  const pluginState = multiCursorPluginKey.getState(state) || EMPTY_STATE
  if (!pluginState.history.length) return true

  const prev = pluginState.history[pluginState.history.length - 1]
  const nextHistory = pluginState.history.slice(0, -1)
  const selRange = prev.ranges.length ? prev.ranges[prev.ranges.length - 1] : prev.native

  setMultiState(
    view,
    {
      ranges: prev.ranges,
      history: nextHistory,
      skipped: prev.skipped,
      preferredCol: prev.preferredCol,
      chord: null,
    },
    selRange,
  )
  return true
}

function clearMultiCursorCmd(view) {
  const { state } = view
  const pluginState = multiCursorPluginKey.getState(state) || EMPTY_STATE
  if (!pluginState.ranges.length && !pluginState.chord) return false
  const primary = pluginState.ranges[0]
  setMultiState(view, EMPTY_STATE, primary ? makeRange(primary.head, primary.head) : undefined)
  return true
}

function applyMultiEdit(view, pluginState, computeEdit) {
  const sorted = sortAndMergeRanges(pluginState.ranges)
  const edits = sorted.map((r, i) => computeEdit(view.state.doc, r, i))
  const tr = view.state.tr

  for (let i = edits.length - 1; i >= 0; i--) {
    const e = edits[i]
    if (e.text) tr.insertText(e.text, e.from, e.to)
    else if (e.from < e.to) tr.delete(e.from, e.to)
  }

  let shift = 0
  const nextRanges = edits.map((e) => {
    const newPos = e.from + shift + (e.text ? e.text.length : 0)
    shift += (e.text ? e.text.length : 0) - (e.to - e.from)
    return makeRange(newPos, newPos)
  })

  const max = tr.doc.content.size
  const primary = nextRanges[0]
  tr.setSelection(TextSelection.create(tr.doc, Math.min(max, primary.anchor), Math.min(max, primary.head)))
  tr.setMeta(multiCursorPluginKey, {
    ranges: nextRanges,
    history: [],
    skipped: [],
    preferredCol: null,
    chord: null,
  })
  view.dispatch(tr.scrollIntoView())
  return true
}

function splitAtMultiCursors(view, pluginState) {
  const sorted = sortAndMergeRanges(pluginState.ranges)
  const tr = view.state.tr
  const stepPositions = []

  for (let i = sorted.length - 1; i >= 0; i--) {
    const r = sorted[i]
    const stepStart = tr.mapping.maps.length
    if (r.from < r.to) tr.delete(r.from, r.to)
    const $pos = tr.doc.resolve(r.from)
    if ($pos.parent.type.name === 'codeBlock') {
      tr.insertText('\n', r.from)
    } else if (canSplit(tr.doc, r.from)) {
      tr.split(r.from)
    }
    stepPositions.unshift({ pos: r.from, mapFrom: stepStart })
  }

  const nextRanges = stepPositions.map((entry) => {
    const mapped = tr.mapping.slice(entry.mapFrom).map(entry.pos, 1)
    return makeRange(mapped, mapped)
  })

  const primary = nextRanges[0]
  tr.setSelection(TextSelection.create(tr.doc, primary.anchor, primary.head))
  tr.setMeta(multiCursorPluginKey, {
    ranges: nextRanges,
    history: [],
    skipped: [],
    preferredCol: null,
    chord: null,
  })
  view.dispatch(tr.scrollIntoView())
  return true
}

function moveMultiCursors(view, pluginState, key, shift) {
  const lines = collectDocLines(view.state.doc)
  const nextRanges = sortAndMergeRanges(pluginState.ranges).map((r) => {
    const line = lines.find((l) => r.head >= l.lineStart && r.head <= l.lineEnd)
    const $head = view.state.doc.resolve(r.head)
    const start = line ? line.lineStart : $head.start()
    const end = line ? line.lineEnd : $head.end()

    let nextHead = r.head
    if (key === 'ArrowLeft') {
      if (!shift && r.from < r.to) nextHead = r.from
      else nextHead = Math.max(start, r.head - 1)
    } else if (key === 'ArrowRight') {
      if (!shift && r.from < r.to) nextHead = r.to
      else nextHead = Math.min(end, r.head + 1)
    } else if (key === 'Home') {
      nextHead = start
    } else if (key === 'End') {
      nextHead = end
    }
    return shift ? makeRange(r.anchor, nextHead) : makeRange(nextHead, nextHead)
  })

  setMultiState(
    view,
    { ...pluginState, ranges: sortAndMergeRanges(nextRanges), preferredCol: null },
    nextRanges[0],
  )
  return true
}

function safeBackspaceFrom(doc, pos) {
  const $pos = doc.resolve(pos)
  if (!$pos.parent.isTextblock) return pos
  const start = $pos.start()
  if (pos <= start) return pos
  const prevChar = doc.textBetween(Math.max(start, pos - 2), pos)
  // Pares substitutos Unicode (ex.: emojis) têm 2 unidades UTF-16.
  if (prevChar.length === 2 && /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(prevChar)) return pos - 2
  return pos - 1
}

function safeDeleteTo(doc, pos) {
  const $pos = doc.resolve(pos)
  if (!$pos.parent.isTextblock) return pos
  const end = $pos.end()
  if (pos >= end) return pos
  const nextChar = doc.textBetween(pos, Math.min(end, pos + 2))
  if (nextChar.length === 2 && /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(nextChar)) return pos + 2
  return pos + 1
}

function copyMultiCursorText(view, pluginState, onCopy) {
  const doc = view.state.doc
  const lines = collectDocLines(doc)
  const parts = sortAndMergeRanges(pluginState.ranges).map((r) => {
    if (r.from < r.to) return doc.textBetween(r.from, r.to, '\n')
    const line = lines.find((l) => r.from >= l.lineStart && r.from <= l.lineEnd)
    return line ? doc.textBetween(line.lineStart, line.lineEnd, '\n') : ''
  })
  const text = parts.join('\n')
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {})
  }
  onCopy?.(text)
  return text
}

export const MultiCursor = Extension.create({
  name: 'multiCursor',
  priority: 1100,

  addOptions() {
    return {
      onChordChange: null,
      onCopyMulti: null,
    }
  },

  addCommands() {
    return {
      selectNextOccurrence:
        () =>
        ({ view, tr }) => {
          tr.setMeta('preventDispatch', true)
          return selectNextOccurrenceCmd(view)
        },
      skipAndSelectNextOccurrence:
        () =>
        ({ view, tr }) => {
          tr.setMeta('preventDispatch', true)
          return skipAndSelectNextCmd(view)
        },
      selectAllOccurrences:
        () =>
        ({ view, tr }) => {
          tr.setMeta('preventDispatch', true)
          return selectAllOccurrencesCmd(view)
        },
      addCursorAbove:
        () =>
        ({ view, tr }) => {
          tr.setMeta('preventDispatch', true)
          return addCursorVerticalCmd(view, -1)
        },
      addCursorBelow:
        () =>
        ({ view, tr }) => {
          tr.setMeta('preventDispatch', true)
          return addCursorVerticalCmd(view, 1)
        },
      addCursorsToLineEnds:
        () =>
        ({ view, tr }) => {
          tr.setMeta('preventDispatch', true)
          return addCursorsToLineEndsCmd(view)
        },
      undoLastCursor:
        () =>
        ({ view, tr }) => {
          tr.setMeta('preventDispatch', true)
          return undoLastCursorCmd(view)
        },
      clearMultiCursors:
        () =>
        ({ view, tr }) => {
          tr.setMeta('preventDispatch', true)
          return clearMultiCursorCmd(view)
        },
    }
  },

  onDestroy() {
    clearTimeout(this.storage?.chordTimer)
  },

  addStorage() {
    return { chordTimer: null }
  },

  addProseMirrorPlugins() {
    const ext = this
    const notifyChord = (chord) => {
      clearTimeout(ext.storage.chordTimer)
      ext.options.onChordChange?.(chord)
      if (chord) {
        ext.storage.chordTimer = setTimeout(() => {
          const cur = multiCursorPluginKey.getState(ext.editor.state)
          if (cur?.chord === chord && !ext.editor.isDestroyed) {
            setMultiState(ext.editor.view, { ...cur, chord: null })
          }
        }, 1600)
      }
    }

    return [
      new Plugin({
        key: multiCursorPluginKey,
        state: {
          init: () => EMPTY_STATE,
          apply(tr, value) {
            const meta = tr.getMeta(multiCursorPluginKey)
            if (meta) {
              if (meta.chord !== value.chord) notifyChord(meta.chord)
              return meta
            }
            if (tr.docChanged) {
              if (value.ranges.length <= 1) {
                if (value.chord) notifyChord(null)
                return EMPTY_STATE
              }
              return {
                ranges: value.ranges.map((r) => mapRangeThrough(r, tr.mapping)),
                history: [],
                skipped: value.skipped.map((r) => mapRangeThrough(r, tr.mapping)),
                preferredCol: null,
                chord: null,
              }
            }
            if (tr.selectionSet && (value.ranges.length || value.chord)) {
              if (value.chord) notifyChord(null)
              return EMPTY_STATE
            }
            return value
          },
        },

        props: {
          decorations(state) {
            const pluginState = multiCursorPluginKey.getState(state)
            if (!pluginState || pluginState.ranges.length <= 1) return DecorationSet.empty
            const decos = []
            const selHead = state.selection.head
            const selEmpty = state.selection.empty
            pluginState.ranges.forEach((r, idx) => {
              if (r.from < r.to) {
                decos.push(Decoration.inline(r.from, r.to, { class: 'pm-multi-sel' }))
              }
              if (!(r.from === r.to && selEmpty && r.head === selHead)) {
                decos.push(
                  Decoration.widget(
                    r.head,
                    () => {
                      const el = document.createElement('span')
                      el.className = 'pm-extra-cursor'
                      el.setAttribute('aria-hidden', 'true')
                      return el
                    },
                    { side: 1, key: `mc-${idx}-${r.head}` },
                  ),
                )
              }
            })
            return DecorationSet.create(state.doc, decos)
          },

          handleTextInput(view, _from, _to, text) {
            const pluginState = multiCursorPluginKey.getState(view.state)
            if (!view.editable || !pluginState || pluginState.ranges.length <= 1) return false
            return applyMultiEdit(view, pluginState, (_doc, r) => ({ from: r.from, to: r.to, text }))
          },

          handlePaste(view, event) {
            const pluginState = multiCursorPluginKey.getState(view.state)
            if (!view.editable || !pluginState || pluginState.ranges.length <= 1) return false
            const text = event.clipboardData?.getData('text/plain')
            if (typeof text !== 'string') return false
            event.preventDefault()
            const lines = text.split(/\r?\n/)
            const sorted = sortAndMergeRanges(pluginState.ranges)
            const perCursor = lines.length === sorted.length
            return applyMultiEdit(view, pluginState, (_doc, r, i) => ({
              from: r.from,
              to: r.to,
              text: perCursor ? lines[i] : text,
            }))
          },

          handleKeyDown(view, event) {
            if (event.getModifierState?.('AltGraph')) return false
            const pluginState = multiCursorPluginKey.getState(view.state) || EMPTY_STATE
            const key = event.key.toLowerCase()
            const mod = event.ctrlKey || event.metaKey

            // Acorde Ctrl+K -> Ctrl+D (pular ocorrência atual e ir para a próxima).
            if (pluginState.chord === 'ctrl-k') {
              if (mod && !event.altKey && !event.shiftKey && key === 'd') {
                event.preventDefault()
                return skipAndSelectNextCmd(view)
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setMultiState(view, { ...pluginState, chord: null })
                return true
              }
              if (!['control', 'meta', 'shift', 'alt'].includes(key)) {
                setMultiState(view, { ...pluginState, chord: null })
              }
            }

            if (mod && !event.altKey && !event.shiftKey && key === 'k') {
              event.preventDefault()
              setMultiState(view, { ...pluginState, chord: 'ctrl-k' })
              return true
            }
            if (mod && !event.altKey && !event.shiftKey && key === 'd') {
              event.preventDefault()
              return selectNextOccurrenceCmd(view)
            }
            if (mod && event.altKey && !event.shiftKey && key === 'l') {
              event.preventDefault()
              return selectAllOccurrencesCmd(view)
            }
            if (mod && event.altKey && !event.shiftKey && event.key === 'ArrowUp') {
              event.preventDefault()
              return addCursorVerticalCmd(view, -1)
            }
            if (mod && event.altKey && !event.shiftKey && event.key === 'ArrowDown') {
              event.preventDefault()
              return addCursorVerticalCmd(view, 1)
            }
            if (!mod && event.altKey && event.shiftKey && key === 'i') {
              event.preventDefault()
              return addCursorsToLineEndsCmd(view)
            }
            if (mod && event.altKey && !event.shiftKey && key === 'u') {
              event.preventDefault()
              return undoLastCursorCmd(view)
            }

            if (pluginState.ranges.length <= 1) return false

            if (event.key === 'Escape') {
              event.preventDefault()
              return clearMultiCursorCmd(view)
            }
            if (event.key === 'Backspace' && !mod && !event.altKey) {
              if (!view.editable) return false
              event.preventDefault()
              return applyMultiEdit(view, pluginState, (doc, r) =>
                r.from < r.to
                  ? { from: r.from, to: r.to, text: '' }
                  : { from: safeBackspaceFrom(doc, r.from), to: r.from, text: '' },
              )
            }
            if (event.key === 'Delete' && !mod && !event.altKey) {
              if (!view.editable) return false
              event.preventDefault()
              return applyMultiEdit(view, pluginState, (doc, r) =>
                r.from < r.to
                  ? { from: r.from, to: r.to, text: '' }
                  : { from: r.from, to: safeDeleteTo(doc, r.to), text: '' },
              )
            }
            if (event.key === 'Enter' && !mod && !event.altKey && !event.shiftKey) {
              if (!view.editable) return false
              event.preventDefault()
              return splitAtMultiCursors(view, pluginState)
            }
            if (!mod && !event.altKey && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
              event.preventDefault()
              return moveMultiCursors(view, pluginState, event.key, event.shiftKey)
            }
            if (mod && !event.altKey && !event.shiftKey && key === 'c') {
              event.preventDefault()
              copyMultiCursorText(view, pluginState, ext.options.onCopyMulti)
              return true
            }
            if (mod && !event.altKey && !event.shiftKey && key === 'x') {
              if (!view.editable) return false
              event.preventDefault()
              copyMultiCursorText(view, pluginState, ext.options.onCopyMulti)
              const hasSelection = pluginState.ranges.some((r) => r.from < r.to)
              if (hasSelection) {
                return applyMultiEdit(view, pluginState, (_doc, r) => ({ from: r.from, to: r.to, text: '' }))
              }
              const lines = collectDocLines(view.state.doc)
              return applyMultiEdit(view, pluginState, (_doc, r) => {
                const line = lines.find((l) => r.from >= l.lineStart && r.from <= l.lineEnd)
                return line ? { from: line.lineStart, to: line.lineEnd, text: '' } : { from: r.from, to: r.to, text: '' }
              })
            }
            return false
          },

          handleDOMEvents: {
            mousedown(view, event) {
              if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return false
              const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
              if (!coords) return false
              const $pos = view.state.doc.resolve(coords.pos)
              if (!$pos.parent.isTextblock) return false
              event.preventDefault()
              view.focus()

              const pluginState = multiCursorPluginKey.getState(view.state) || EMPTY_STATE
              const sel = view.state.selection
              const base = pluginState.ranges.length ? pluginState.ranges : [makeRange(sel.anchor, sel.head)]
              const clicked = makeRange(coords.pos, coords.pos)
              const existingIdx = base.findIndex((r) => sameSpan(r, clicked) || (coords.pos >= r.from && coords.pos <= r.to && r.from < r.to))

              let nextRanges
              if (existingIdx !== -1 && base.length > 1) {
                nextRanges = base.filter((_, idx) => idx !== existingIdx)
              } else {
                nextRanges = sortAndMergeRanges([...base, clicked])
              }

              setMultiState(
                view,
                {
                  ranges: nextRanges,
                  history: pushHistory(pluginState, sel),
                  skipped: [],
                  preferredCol: null,
                  chord: null,
                },
                clicked,
              )
              return true
            },
          },
        },
      }),
    ]
  },
})
