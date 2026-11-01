import { describe, it, expect } from 'vitest'
import { listChanges } from '../src/motion.js'

const positions = (entries) => new Map(Object.entries(entries))

describe('listChanges (animação da lista)', () => {
  it('sem mudança, nada se mexe', () => {
    const p = positions({ a: 0, b: 60 })
    expect(listChanges(p, p)).toEqual({ moved: [], added: [] })
  })

  it('nota que subiu para o topo anima a partir de onde estava', () => {
    const before = positions({ a: 0, b: 60, c: 120 })
    const after = positions({ c: 0, a: 60, b: 120 })
    expect(listChanges(before, after).moved).toEqual([
      ['c', 120],
      ['a', -60],
      ['b', -60],
    ])
  })

  it('nota nova aparece como adicionada e empurra as outras', () => {
    const before = positions({ a: 0 })
    const after = positions({ novo: 0, a: 60 })
    expect(listChanges(before, after)).toEqual({ moved: [['a', -60]], added: ['novo'] })
  })

  it('nota que saiu não aparece no resultado', () => {
    const before = positions({ a: 0, b: 60 })
    const after = positions({ b: 0 })
    expect(listChanges(before, after)).toEqual({ moved: [['b', 60]], added: [] })
  })

  it('ignora diferenças menores que 1 px', () => {
    expect(listChanges(positions({ a: 10 }), positions({ a: 10.4 })).moved).toEqual([])
  })
})
