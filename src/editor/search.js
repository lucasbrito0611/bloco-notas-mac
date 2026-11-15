import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { collectDocMatches } from './docText.js'

export const noteSearchPluginKey = new PluginKey('noteSearch')

const EMPTY_SEARCH = {
  query: '',
  caseSensitive: false,
  matches: [],
  activeIndex: -1,
}

function firstMatchFromPos(matches, pos) {
  if (!matches.length) return -1
  const idx = matches.findIndex((m) => m.from >= pos)
  return idx === -1 ? 0 : idx
}

function scrollActiveIntoView(view) {
  if (typeof requestAnimationFrame === 'undefined' || !view?.dom) return
  requestAnimationFrame(() => {
    view.dom.querySelector('.pm-find-match.active')?.scrollIntoView?.({ block: 'nearest' })
  })
}

export const NoteSearch = Extension.create({
  name: 'noteSearch',

  addCommands() {
    return {
      setNoteSearch:
        (query, caseSensitive) =>
        ({ state, dispatch, view }) => {
          const prev = noteSearchPluginKey.getState(state) || EMPTY_SEARCH
          const nextQuery = query ?? prev.query
          const nextCase = caseSensitive ?? prev.caseSensitive
          const matches = collectDocMatches(state.doc, nextQuery, { caseSensitive: nextCase })
          const activeIndex = firstMatchFromPos(matches, state.selection.from)
          if (dispatch) {
            dispatch(
              state.tr.setMeta(noteSearchPluginKey, {
                query: nextQuery,
                caseSensitive: nextCase,
                matches,
                activeIndex,
              }),
            )
            scrollActiveIntoView(view)
          }
          return true
        },

      nextNoteMatch:
        () =>
        ({ state, dispatch, view }) => {
          const prev = noteSearchPluginKey.getState(state) || EMPTY_SEARCH
          if (!prev.matches.length) return false
          const activeIndex = (prev.activeIndex + 1) % prev.matches.length
          if (dispatch) {
            dispatch(state.tr.setMeta(noteSearchPluginKey, { ...prev, activeIndex }))
            scrollActiveIntoView(view)
          }
          return true
        },

      prevNoteMatch:
        () =>
        ({ state, dispatch, view }) => {
          const prev = noteSearchPluginKey.getState(state) || EMPTY_SEARCH
          if (!prev.matches.length) return false
          const activeIndex = (prev.activeIndex - 1 + prev.matches.length) % prev.matches.length
          if (dispatch) {
            dispatch(state.tr.setMeta(noteSearchPluginKey, { ...prev, activeIndex }))
            scrollActiveIntoView(view)
          }
          return true
        },

      replaceNoteMatch:
        (replacement = '') =>
        ({ editor, state, dispatch, view }) => {
          if (!editor.isEditable) return false
          const prev = noteSearchPluginKey.getState(state) || EMPTY_SEARCH
          if (!prev.matches.length || prev.activeIndex < 0) return false
          const target = prev.matches[prev.activeIndex]
          if (!target) return false
          if (!dispatch) return true

          const tr = replacement
            ? state.tr.insertText(replacement, target.from, target.to)
            : state.tr.delete(target.from, target.to)

          const nextMatches = collectDocMatches(tr.doc, prev.query, { caseSensitive: prev.caseSensitive })
          const afterPos = target.from + replacement.length
          const activeIndex = firstMatchFromPos(nextMatches, afterPos)

          tr.setMeta(noteSearchPluginKey, {
            ...prev,
            matches: nextMatches,
            activeIndex,
          })
          dispatch(tr)
          scrollActiveIntoView(view)
          return true
        },

      replaceAllNoteMatches:
        (replacement = '') =>
        ({ editor, state, dispatch }) => {
          if (!editor.isEditable) return false
          const prev = noteSearchPluginKey.getState(state) || EMPTY_SEARCH
          if (!prev.matches.length) return false
          if (!dispatch) return true

          const tr = state.tr
          for (let i = prev.matches.length - 1; i >= 0; i--) {
            const m = prev.matches[i]
            if (replacement) tr.insertText(replacement, m.from, m.to)
            else tr.delete(m.from, m.to)
          }

          const nextMatches = collectDocMatches(tr.doc, prev.query, { caseSensitive: prev.caseSensitive })
          tr.setMeta(noteSearchPluginKey, {
            ...prev,
            matches: nextMatches,
            activeIndex: nextMatches.length ? 0 : -1,
          })
          dispatch(tr)
          return true
        },

      focusActiveNoteMatch:
        () =>
        ({ state, dispatch }) => {
          const prev = noteSearchPluginKey.getState(state) || EMPTY_SEARCH
          const target = prev.matches[prev.activeIndex]
          if (!target || !dispatch) return false
          const tr = state.tr.setSelection(TextSelection.create(state.doc, target.from, target.to))
          dispatch(tr.scrollIntoView())
          return true
        },

      clearNoteSearch:
        () =>
        ({ state, dispatch }) => {
          const prev = noteSearchPluginKey.getState(state)
          if (!prev?.query) return true
          if (dispatch) dispatch(state.tr.setMeta(noteSearchPluginKey, EMPTY_SEARCH))
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: noteSearchPluginKey,
        state: {
          init: () => EMPTY_SEARCH,
          apply(tr, value) {
            const meta = tr.getMeta(noteSearchPluginKey)
            if (meta) return meta
            if (tr.docChanged && value.query) {
              const matches = collectDocMatches(tr.doc, value.query, { caseSensitive: value.caseSensitive })
              const activeIndex = matches.length ? Math.min(Math.max(0, value.activeIndex), matches.length - 1) : -1
              return { ...value, matches, activeIndex }
            }
            return value
          },
        },
        props: {
          decorations(state) {
            const pluginState = noteSearchPluginKey.getState(state)
            if (!pluginState?.matches.length) return DecorationSet.empty
            const decos = pluginState.matches.map((m, i) =>
              Decoration.inline(m.from, m.to, {
                class: i === pluginState.activeIndex ? 'pm-find-match active' : 'pm-find-match',
              }),
            )
            return DecorationSet.create(state.doc, decos)
          },
        },
      }),
    ]
  },
})

