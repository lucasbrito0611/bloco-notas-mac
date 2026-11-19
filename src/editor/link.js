import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'

// Links do editor. A extensão Link já vem no StarterKit (extensions.js configura as opções aqui).
// Regras: só http, https e mailto. Clique simples posiciona o cursor; Ctrl+clique abre no navegador.

export const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:']

// Devolve a URL normalizada se o protocolo for seguro, ou null. Usa o parser de URL do navegador,
// que também descarta controles e tabs escondidos (ex.: "java\tscript:"), truque comum para burlar
// filtros. Relativas ("/pasta") são recusadas, porque não têm protocolo.
export function safeLinkHref(url) {
  if (typeof url !== 'string') return null
  try {
    const parsed = new URL(url)
    return SAFE_PROTOCOLS.includes(parsed.protocol) ? parsed.href : null
  } catch {
    return null
  }
}

// Domínio "solto" que o autolink reconhece: "www.exemplo.com", "exemplo.com:8080/a", "ana@exemplo.com".
// Regex ASCII ancorada no início: nada antes do host (nem controles, nem "javascript:") passa.
const BARE_HOST = /^(?:[a-z0-9._%+-]+@)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?(?:[/?#]\S*)?$/i

// Sem protocolo, mas com cara de domínio, assume http (como o navegador). Qualquer outra coisa
// volta como está e é recusada por safeLinkHref.
export function linkableHrefOf(value) {
  const text = String(value)
  return BARE_HOST.test(text) ? `http://${text}` : text
}

// Só Ctrl + botão esquerdo abre o link. Alt fica de fora porque é do multi-cursor
// e, no Windows, AltGr é Ctrl+Alt (digitar acento não pode abrir link).
export function shouldOpenLinkOnClick(event) {
  return event.button === 0 && event.ctrlKey && !event.altKey && !event.shiftKey
}

// Acha o link (a[href]) sob o evento, só se estiver dentro do editor.
function linkUnderEvent(view, event) {
  const anchor = event.target?.closest?.('a[href]')
  return anchor && view.dom.contains(anchor) ? anchor : null
}

// Opções do Link. Passadas para StarterKit.configure({ link }) para não ter duas cópias da extensão.
export const linkOptions = {
  openOnClick: false, // o clique simples não abre; o LinkOpenOnCtrlClick cuida do Ctrl+clique
  autolink: true,
  linkOnPaste: true, // colar uma URL com texto selecionado transforma a seleção em link
  defaultProtocol: 'http',
  // Usado ao criar, ler e desenhar o link. Vale para o texto cru do autolink ("www.exemplo.com"),
  // então aplica linkableHrefOf antes. Protocolo fora da lista e URL relativa são recusados.
  isAllowedUri: (url) => safeLinkHref(linkableHrefOf(url)) !== null,
  shouldAutoLink: (value) => safeLinkHref(linkableHrefOf(value)) !== null,
  // Sem target: o clique nunca manda o próprio app para outra página.
  HTMLAttributes: { target: null, rel: 'noopener noreferrer nofollow' },
}

// Clique em link: o editor nunca navega a janela (inclusive na lixeira, onde não é editável),
// e o Ctrl+clique abre no navegador padrão. O window.open cai no setWindowOpenHandler do main.cjs,
// que entrega o endereço ao Windows e nega abrir uma janela do próprio app.
export const LinkOpenOnCtrlClick = Extension.create({
  name: 'linkOpenOnCtrlClick',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          // Roda no mouseup, antes da seleção de nó que o Ctrl dispara no Windows.
          // Devolver true pula essa seleção, então o Ctrl+clique num link não seleciona o parágrafo.
          handleClick(view, _pos, event) {
            if (!shouldOpenLinkOnClick(event)) return false
            const anchor = linkUnderEvent(view, event)
            if (!anchor) return false
            event.preventDefault()
            const href = safeLinkHref(anchor.getAttribute('href'))
            if (href) window.open(href, '_blank')
            return true
          },

          // Só cancela a navegação do clique (e do botão do meio) em links.
          // Quem abre é o handleClick acima; aqui nada é aberto, para não abrir duas vezes.
          handleDOMEvents: {
            click(view, event) {
              if (linkUnderEvent(view, event)) event.preventDefault()
              return false
            },
            auxclick(view, event) {
              if (linkUnderEvent(view, event)) event.preventDefault()
              return false
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
