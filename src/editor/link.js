import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'

// Links do editor. A extensão Link já vem no StarterKit (extensions.js configura as opções aqui).
// Regras: só http, https e mailto. Clique simples posiciona o cursor; Ctrl+clique abre no navegador.

export const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:']

// Devolve a URL se o protocolo for seguro, ou null. Usa o parser de URL do navegador, que
// também ignora tabs e quebras de linha escondidas (ex.: "java\tscript:"), truque comum para
// burlar filtros. Relativas ("/pasta") também são recusadas, porque não têm protocolo.
export function safeLinkHref(url) {
  if (typeof url !== 'string') return null
  const href = url.trim()
  try {
    return SAFE_PROTOCOLS.includes(new URL(href).protocol) ? href : null
  } catch {
    return null
  }
}

// Texto que o autolink reconhece ("www.exemplo.com", "ana@exemplo.com") vira href.
// Sem protocolo, mas com cara de domínio, assume http, como o navegador. Com outro protocolo
// (javascript:, file:) ou relativo ("/pasta", "x"), fica como está e é recusado depois.
export function linkableHrefOf(value) {
  const text = String(value).trim()
  const hasScheme = /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(text) // "host:8080" não é protocolo
  const looksLikeHost = /^[^\s/?#]+\.[^\s/?#]+/.test(text)
  return !hasScheme && looksLikeHost ? `http://${text}` : text
}

// Só Ctrl + botão esquerdo abre o link. Alt fica de fora porque é do multi-cursor
// e, no Windows, AltGr é Ctrl+Alt (digitar acento não pode abrir link).
export function shouldOpenLinkOnClick(event) {
  return event.button === 0 && event.ctrlKey && !event.altKey && !event.shiftKey
}

// Opções do Link. Passadas para StarterKit.configure({ link }) para não ter duas cópias da extensão.
export const linkOptions = {
  openOnClick: false, // o clique simples não abre (o LinkOpenOnCtrlClick cuida do Ctrl+clique)
  autolink: true,
  linkOnPaste: true, // colar uma URL com texto selecionado transforma a seleção em link
  defaultProtocol: 'http',
  // Recusa protocolo fora da lista e URL relativa ao criar, ler e renderizar o link.
  // O autolink também chama isAllowedUri com o texto cru ("www.exemplo.com"), por isso linkableHrefOf antes.
  isAllowedUri: (url) => safeLinkHref(linkableHrefOf(url)) !== null,
  shouldAutoLink: (value) => safeLinkHref(linkableHrefOf(value)) !== null,
  // Sem target: o clique nunca manda o próprio app para outra página.
  HTMLAttributes: { target: null, rel: 'noopener noreferrer nofollow' },
}

// Ctrl+clique num link abre no navegador padrão. O window.open cai no setWindowOpenHandler
// do main.cjs, que entrega o endereço ao Windows e nega abrir uma janela do próprio app.
// O clique simples não entra aqui: o editor só posiciona o cursor, então dá para editar o texto do link.
export const LinkOpenOnCtrlClick = Extension.create({
  name: 'linkOpenOnCtrlClick',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            click(view, event) {
              if (!shouldOpenLinkOnClick(event)) return false
              const anchor = event.target?.closest?.('a[href]')
              if (!anchor || !view.dom.contains(anchor)) return false
              const href = safeLinkHref(anchor.getAttribute('href'))
              if (!href) return false
              event.preventDefault()
              window.open(href, '_blank')
              return true
            },
          },
        },
        // Enquanto o Ctrl estiver apertado, o atributo data-ctrl deixa a mãozinha aparecer (ver styles.css).
        view(editorView) {
          const win = editorView.dom.ownerDocument.defaultView
          const sync = (event) => editorView.dom.toggleAttribute('data-ctrl', !!event.ctrlKey)
          const clear = () => editorView.dom.removeAttribute('data-ctrl')
          win.addEventListener('keydown', sync)
          win.addEventListener('keyup', sync)
          win.addEventListener('blur', clear)
          return {
            destroy() {
              win.removeEventListener('keydown', sync)
              win.removeEventListener('keyup', sync)
              win.removeEventListener('blur', clear)
            },
          }
        },
      }),
    ]
  },
})
