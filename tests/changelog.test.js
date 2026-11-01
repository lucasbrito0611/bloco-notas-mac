import { describe, it, expect } from 'vitest'
import { CHANGELOG, compareVersions, newsSince } from '../src/changelog.js'
import pkg from '../package.json'

const log = ['1.5.0', '1.4.0', '1.3.0', '1.10.0'].map((version) => ({ version, items: [version] }))
const versions = (entries) => entries.map((e) => e.version)

describe('compareVersions', () => {
  it('compara número a número, não como texto', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
    expect(compareVersions('1.0.9', '2.0.0')).toBeLessThan(0)
  })
})

describe('newsSince (janela de novidades)', () => {
  it('na primeira instalação não mostra nada', () => {
    expect(newsSince(log, null, '1.5.0')).toEqual([])
  })

  it('fora do app (versão "web") não mostra nada', () => {
    expect(newsSince(log, '1.4.0', 'web')).toEqual([])
  })

  it('sem atualização não mostra nada', () => {
    expect(newsSince(log, '1.5.0', '1.5.0')).toEqual([])
  })

  it('depois de atualizar, mostra a versão nova', () => {
    expect(versions(newsSince(log, '1.4.0', '1.5.0'))).toEqual(['1.5.0'])
  })

  it('se pulou versões, mostra todas, da mais nova para a mais antiga', () => {
    expect(versions(newsSince(log, '1.3.0', '1.10.0'))).toEqual(['1.10.0', '1.5.0', '1.4.0'])
  })

  it('versão de correção sem entrada não mostra nada', () => {
    expect(newsSince(log, '1.5.0', '1.5.1')).toEqual([])
  })
})

describe('CHANGELOG', () => {
  // Trava o release: a tag roda os testes antes de gerar o instalador.
  it('tem as novidades da versão do package.json', () => {
    expect(versions(CHANGELOG)).toContain(pkg.version)
  })

  it('está em ordem, da mais nova para a mais antiga, sem repetir versão', () => {
    for (let i = 1; i < CHANGELOG.length; i++) expect(compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBeGreaterThan(0)
  })

  it('toda entrada tem pelo menos um item', () => {
    for (const e of CHANGELOG) expect(e.items.length).toBeGreaterThan(0)
  })
})
