import { Node, mergeAttributes } from '@tiptap/core'
import { formatSize } from '../notes.js'

const extOf = (name) => (name.includes('.') ? name.split('.').pop().slice(0, 4).toUpperCase() : 'ARQ')

// Um anexo (PDF, planilha, zip…) aparece na nota como um cartão com ícone, nome e tamanho.
// O arquivo em si fica salvo fora da nota; aqui guardamos só o endereço dele.
export const Attachment = Node.create({
  name: 'attachment',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null, parseHTML: (el) => el.getAttribute('data-src') },
      name: { default: 'arquivo', parseHTML: (el) => el.getAttribute('data-name') },
      size: { default: 0, parseHTML: (el) => Number(el.getAttribute('data-size')) || 0 },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-attachment]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const { src, name, size } = node.attrs
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-attachment': '',
        'data-src': src,
        'data-name': name,
        'data-size': String(size),
        class: 'attachment',
        title: 'Clique duas vezes para abrir',
      }),
      ['span', { class: 'att-icon' }, extOf(name)],
      ['span', { class: 'att-info' }, ['span', { class: 'att-name' }, name], ['span', { class: 'att-size' }, formatSize(size)]],
    ]
  },

  // Faz o nome do anexo entrar no texto da nota (título, prévia e busca).
  renderText({ node }) {
    return `📎 ${node.attrs.name}`
  },
})
