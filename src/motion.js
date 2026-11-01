import { useLayoutEffect, useRef } from 'react'

// Mesmos valores de --motion e --ease em styles.css.
export const DURATION = 280
export const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Compara as posições (id → topo, em px) de antes e depois de uma mudança na lista.
// Devolve quanto cada item se deslocou e quais itens são novos.
export function listChanges(before, after) {
  const moved = []
  const added = []
  for (const [id, top] of after) {
    if (!before.has(id)) added.push(id)
    else if (Math.abs(before.get(id) - top) >= 1) moved.push([id, before.get(id) - top])
  }
  return { moved, added }
}

// offsetTop ignora o transform das animações em andamento e não muda com a rolagem.
function measure(container) {
  const positions = new Map()
  for (const el of container.querySelectorAll('[data-flip]')) positions.set(el.dataset.flip, el.offsetTop)
  return positions
}

// Técnica FLIP: mede onde cada item [data-flip] estava antes de o React mudar a lista e,
// depois da mudança, anima do lugar antigo até o novo. Itens novos aparecem com um fade.
// Quando `scope` muda (outra pasta ou outra busca), a lista só troca, sem animar.
export function useListMotion(containerRef, scope) {
  const lastScope = useRef(null)
  // Ainda na fase de render: o DOM continua mostrando a lista antiga.
  const before = containerRef.current && lastScope.current === scope ? measure(containerRef.current) : null

  useLayoutEffect(() => {
    lastScope.current = scope
    const container = containerRef.current
    if (!before || !container || reducedMotion()) return
    const { moved, added } = listChanges(before, measure(container))
    const find = (id) => container.querySelector(`[data-flip="${CSS.escape(id)}"]`)
    for (const [id, dy] of moved) {
      find(id)?.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: DURATION, easing: EASE })
    }
    for (const id of added) {
      find(id)?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION, easing: 'ease-out' })
    }
  })
}

// Recolhe o elemento (altura e opacidade até zero) antes de ele sair da lista.
// A promessa resolve quando a animação termina; sem elemento, resolve na hora.
export function collapse(el) {
  if (!el || reducedMotion()) return Promise.resolve()
  el.style.overflow = 'hidden'
  const animation = el.animate(
    [
      { height: `${el.offsetHeight}px`, opacity: 1 },
      { height: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: 0 },
    ],
    // forwards: continua recolhido até o React tirar o elemento da tela.
    { duration: DURATION * 0.8, easing: EASE, fill: 'forwards' },
  )
  return animation.finished.catch(() => {})
}
