import { describe, it, expect } from 'vitest'
import {
  ALL,
  DEFAULT_FOLDER,
  titleOf,
  previewOf,
  isBlank,
  normalize,
  shortDate,
  groupOf,
  filterNotes,
  groupNotes,
  removeFolder,
  formatSize,
  initialData,
  DAY,
} from '../src/notes.js'

const NOW = new Date(2026, 9, 30, 15, 0).getTime()
const note = (over = {}) => ({ id: 'n', folderId: DEFAULT_FOLDER, pinned: false, createdAt: NOW, updatedAt: NOW, html: '', text: '', ...over })

describe('título e prévia', () => {
  it('usa a primeira linha com texto como título e a segunda como prévia', () => {
    const n = note({ text: '\n\n  Lista de compras \n\nCafé\nPão' })
    expect(titleOf(n)).toBe('Lista de compras')
    expect(previewOf(n)).toBe('Café')
  })

  it('mostra textos padrão para nota sem conteúdo', () => {
    expect(titleOf(note())).toBe('Nova Nota')
    expect(previewOf(note({ text: 'Só título' }))).toBe('Nenhum texto adicional')
  })

  it('chama de "Imagem" uma nota que só tem imagem', () => {
    const n = note({ html: '<img src="notas://anexos/a.png">' })
    expect(titleOf(n)).toBe('Imagem')
  })

  it('mostra "Imagem" na prévia quando a nota tem título e imagem', () => {
    const n = note({ text: 'Viagem', html: '<p>Viagem</p><img src="x">' })
    expect(previewOf(n)).toBe('Imagem')
  })
})

describe('nota vazia', () => {
  it('é vazia sem texto e sem conteúdo especial', () => {
    expect(isBlank(note({ text: '  \n ' }))).toBe(true)
  })

  it('não é vazia se tiver imagem, anexo ou tabela, mesmo sem texto', () => {
    expect(isBlank(note({ html: '<img src="x">' }))).toBe(false)
    expect(isBlank(note({ html: '<div data-attachment="" data-name="a.pdf"></div>' }))).toBe(false)
    expect(isBlank(note({ html: '<table><tbody><tr><td><p></p></td></tr></tbody></table>' }))).toBe(false)
  })
})

describe('busca', () => {
  it('ignora acentos e maiúsculas', () => {
    expect(normalize('Pão de Açúcar')).toBe('pao de acucar')
  })

  it('filtra por pasta e por texto e ordena da mais recente para a mais antiga', () => {
    const notes = [
      note({ id: 'a', text: 'Reunião', updatedAt: NOW - 10, folderId: 'trabalho' }),
      note({ id: 'b', text: 'reuniao de pais', updatedAt: NOW }),
      note({ id: 'c', text: 'Mercado', updatedAt: NOW - 5 }),
    ]
    expect(filterNotes(notes).map((n) => n.id)).toEqual(['b', 'c', 'a'])
    expect(filterNotes(notes, { query: 'REUNIÃO' }).map((n) => n.id)).toEqual(['b', 'a'])
    expect(filterNotes(notes, { folderId: 'trabalho' }).map((n) => n.id)).toEqual(['a'])
    expect(filterNotes(notes, { folderId: ALL, query: '   ' })).toHaveLength(3)
  })
})

describe('datas e grupos', () => {
  it('agrupa por data, com fixadas sempre primeiro', () => {
    expect(groupOf(note({ pinned: true, updatedAt: NOW - 40 * DAY }), NOW)).toBe('Fixadas')
    expect(groupOf(note({ updatedAt: NOW - 60 * 1000 }), NOW)).toBe('Hoje')
    expect(groupOf(note({ updatedAt: NOW - DAY }), NOW)).toBe('Ontem')
    expect(groupOf(note({ updatedAt: NOW - 3 * DAY }), NOW)).toBe('7 Dias Anteriores')
    expect(groupOf(note({ updatedAt: NOW - 20 * DAY }), NOW)).toBe('30 Dias Anteriores')
    expect(groupOf(note({ updatedAt: NOW - 90 * DAY }), NOW)).toBe('Mais Antigas')
  })

  it('devolve os grupos na ordem do Notas e sem grupos vazios', () => {
    const notes = [note({ id: 'old', updatedAt: NOW - 90 * DAY }), note({ id: 'pin', pinned: true }), note({ id: 'today' })]
    expect(groupNotes(notes, NOW).map(([g]) => g)).toEqual(['Fixadas', 'Hoje', 'Mais Antigas'])
  })

  it('mostra "Ontem" para a data de ontem', () => {
    expect(shortDate(NOW - DAY, NOW)).toBe('Ontem')
  })
})

describe('pastas', () => {
  it('ao apagar uma pasta, as notas dela vão para a pasta padrão', () => {
    const data = {
      folders: [{ id: DEFAULT_FOLDER, name: 'Notas' }, { id: 'f1', name: 'Faculdade' }],
      notes: [note({ id: 'a', folderId: 'f1' }), note({ id: 'b' })],
    }
    const result = removeFolder(data, 'f1')
    expect(result.folders.map((f) => f.id)).toEqual([DEFAULT_FOLDER])
    expect(result.notes.every((n) => n.folderId === DEFAULT_FOLDER)).toBe(true)
  })

  it('nunca apaga a pasta padrão', () => {
    const data = initialData(NOW)
    expect(removeFolder(data, DEFAULT_FOLDER)).toBe(data)
  })
})

describe('tamanho de arquivo', () => {
  it('formata em B, KB e MB', () => {
    expect(formatSize(500)).toBe('500 B')
    expect(formatSize(2048)).toBe('2 KB')
    expect(formatSize(5.5 * 1024 * 1024)).toBe('5,5 MB')
  })
})
