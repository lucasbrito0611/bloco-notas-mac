import { describe, it, expect } from 'vitest'
import { initialUpdate, updateReducer, showUpdateModal, showUpdateButton } from '../src/updates.js'

const run = (...events) => events.reduce(updateReducer, initialUpdate)

describe('fluxo de atualização', () => {
  it('sem versão nova, não mostra nada', () => {
    const s = run()
    expect(showUpdateModal(s)).toBe(false)
    expect(showUpdateButton(s)).toBe(false)
  })

  it('quando encontra versão nova, mostra o modal', () => {
    const s = run({ type: 'available', version: '1.2.0' })
    expect(s.version).toBe('1.2.0')
    expect(showUpdateModal(s)).toBe(true)
    expect(showUpdateButton(s)).toBe(false)
  })

  it('ao recusar, fecha o modal e deixa o botão de atualizar visível', () => {
    const s = run({ type: 'available', version: '1.2.0' }, { type: 'dismiss' })
    expect(showUpdateModal(s)).toBe(false)
    expect(showUpdateButton(s)).toBe(true)
  })

  it('a mesma versão encontrada de novo não reabre o modal recusado', () => {
    const s = run({ type: 'available', version: '1.2.0' }, { type: 'dismiss' }, { type: 'available', version: '1.2.0' })
    expect(showUpdateModal(s)).toBe(false)
    expect(showUpdateButton(s)).toBe(true)
  })

  it('uma versão ainda mais nova reabre o modal', () => {
    const s = run({ type: 'available', version: '1.2.0' }, { type: 'dismiss' }, { type: 'available', version: '1.3.0' })
    expect(showUpdateModal(s)).toBe(true)
  })

  it('aceitar baixa com progresso e depois instala', () => {
    let s = run({ type: 'available', version: '1.2.0' }, { type: 'start' }, { type: 'progress', percent: 42.4 })
    expect(s.phase).toBe('downloading')
    expect(s.percent).toBe(42)
    expect(showUpdateModal(s)).toBe(true)
    s = updateReducer(s, { type: 'downloaded' })
    expect(s.phase).toBe('installing')
  })

  it('clicar no botão depois de recusar também inicia o download', () => {
    const s = run({ type: 'available', version: '1.2.0' }, { type: 'dismiss' }, { type: 'start' })
    expect(s.phase).toBe('downloading')
    expect(showUpdateButton(s)).toBe(false)
  })

  it('uma nova verificação durante o download não interrompe o download', () => {
    const s = run({ type: 'available', version: '1.2.0' }, { type: 'start' }, { type: 'available', version: '1.2.0' })
    expect(s.phase).toBe('downloading')
  })

  it('erro ao só verificar (sem internet) é ignorado', () => {
    const s = run({ type: 'error', message: 'net::ERR_INTERNET_DISCONNECTED' })
    expect(s.phase).toBe('idle')
    expect(showUpdateModal(s)).toBe(false)
  })

  it('erro no download mostra o modal de erro; fechar deixa o botão de atualizar', () => {
    let s = run({ type: 'available', version: '1.2.0' }, { type: 'start' }, { type: 'error', message: 'falhou' })
    expect(s.phase).toBe('error')
    expect(showUpdateModal(s)).toBe(true)
    s = updateReducer(s, { type: 'close' })
    expect(showUpdateModal(s)).toBe(false)
    expect(showUpdateButton(s)).toBe(true)
  })
})
