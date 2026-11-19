import { describe, it, expect } from 'vitest'
import {
  ALL,
  DEFAULT_FOLDER,
  DEFAULT_SORT,
  SORT_OPTIONS,
  isValidSort,
  titleOf,
  previewOf,
  isBlank,
  normalize,
  shortDate,
  groupOf,
  sortNotes,
  filterNotes,
  groupNotes,
  moveNote,
  duplicateNote,
  removeFolder,
  formatSize,
  initialData,
  DAY,
  TRASH,
  countNotes,
  moveToTrash,
  restoreNote,
  deleteForever,
  emptyTrash,
  purgeTrash,
  daysLeft,
  attachmentUrls,
  mergeData,
  importMessage,
  quickOpenNotes,
  pushNavHistory,
  stepNavHistory,
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

describe('lixeira', () => {
  const base = () => ({
    folders: [{ id: DEFAULT_FOLDER, name: 'Notas' }, { id: 'f1', name: 'Faculdade' }],
    notes: [note({ id: 'a', folderId: 'f1', pinned: true, text: 'Prova' }), note({ id: 'b', text: 'Mercado' })],
  })

  it('apagar manda a nota para a lixeira, que é o único lugar onde ela aparece', () => {
    const data = moveToTrash(base(), 'a', NOW)
    expect(filterNotes(data.notes).map((n) => n.id)).toEqual(['b'])
    expect(filterNotes(data.notes, { folderId: 'f1' })).toHaveLength(0)
    expect(filterNotes(data.notes, { folderId: TRASH }).map((n) => n.id)).toEqual(['a'])
    expect(filterNotes(data.notes, { query: 'prova' })).toHaveLength(0)
    expect(countNotes(data.notes, ALL)).toBe(1)
    expect(countNotes(data.notes, TRASH)).toBe(1)
  })

  it('nota apagada perde o "fixada" e fica num grupo sem título', () => {
    const data = moveToTrash(base(), 'a', NOW)
    const trashed = filterNotes(data.notes, { folderId: TRASH })
    expect(trashed[0].pinned).toBe(false)
    expect(groupNotes(trashed, NOW)).toEqual([['', trashed]])
  })

  it('recuperar devolve a nota para a pasta de origem', () => {
    const data = restoreNote(moveToTrash(base(), 'a', NOW), 'a')
    const a = data.notes.find((n) => n.id === 'a')
    expect(a.deletedAt).toBeNull()
    expect(a.folderId).toBe('f1')
    expect(filterNotes(data.notes, { folderId: 'f1' }).map((n) => n.id)).toEqual(['a'])
  })

  it('se a pasta de origem foi apagada, recuperar manda para "Notas"', () => {
    let data = moveToTrash(base(), 'a', NOW)
    data = { ...data, folders: data.folders.filter((f) => f.id !== 'f1') }
    expect(restoreNote(data, 'a').notes.find((n) => n.id === 'a').folderId).toBe(DEFAULT_FOLDER)
  })

  it('apagar permanentemente e esvaziar a lixeira removem de vez', () => {
    let data = moveToTrash(moveToTrash(base(), 'a', NOW), 'b', NOW)
    expect(deleteForever(data, 'a').notes.map((n) => n.id)).toEqual(['b'])
    data = restoreNote(data, 'b')
    expect(emptyTrash(data).notes.map((n) => n.id)).toEqual(['b'])
  })

  it('notas na lixeira há mais de 30 dias somem sozinhas', () => {
    let data = moveToTrash(base(), 'a', NOW - 31 * DAY)
    data = moveToTrash(data, 'b', NOW - 29 * DAY)
    expect(purgeTrash(data, NOW).notes.map((n) => n.id)).toEqual(['b'])
    const clean = base()
    expect(purgeTrash(clean, NOW)).toBe(clean)
  })

  it('conta quantos dias faltam para a nota sumir', () => {
    expect(daysLeft({ deletedAt: NOW }, NOW)).toBe(30)
    expect(daysLeft({ deletedAt: NOW - 10.5 * DAY }, NOW)).toBe(20)
    expect(daysLeft({ deletedAt: NOW - 40 * DAY }, NOW)).toBe(0)
  })
})

describe('anexos usados pelas notas', () => {
  it('encontra imagens e arquivos em todas as notas, sem repetir', () => {
    const notes = [
      note({ html: '<img src="notas://anexos/a1-foto.png"><div data-attachment="" data-src="notas://anexos/b2-doc.pdf"></div>' }),
      note({ html: '<img src="notas://anexos/a1-foto.png">', deletedAt: NOW }),
      note({ html: '<p>sem anexos</p>' }),
    ]
    expect(attachmentUrls(notes).sort()).toEqual(['notas://anexos/a1-foto.png', 'notas://anexos/b2-doc.pdf'])
  })
})

describe('importar notas de um arquivo .notas', () => {
  const folders = [{ id: DEFAULT_FOLDER, name: 'Notas' }]

  it('adiciona as notas que ainda não existem e mantém as atuais', () => {
    const current = { folders, notes: [note({ id: 'a', text: 'Daqui' })] }
    const imported = { folders, notes: [note({ id: 'b', text: 'De lá' })] }
    const { data, added, updated } = mergeData(current, imported)
    expect(data.notes.map((n) => n.id)).toEqual(['a', 'b'])
    expect([added, updated]).toEqual([1, 0])
  })

  it('na mesma nota dos dois lados, fica a que mudou por último', () => {
    const current = { folders, notes: [note({ id: 'a', text: 'antiga', updatedAt: NOW - DAY }), note({ id: 'b', text: 'nova aqui' })] }
    const imported = { folders, notes: [note({ id: 'a', text: 'nova lá' }), note({ id: 'b', text: 'antiga lá', updatedAt: NOW - DAY })] }
    const { data, added, updated } = mergeData(current, imported)
    expect(data.notes.map((n) => n.text)).toEqual(['nova lá', 'nova aqui'])
    expect([added, updated]).toEqual([0, 1])
  })

  it('mandar para o lixo conta como mudança', () => {
    const current = { folders, notes: [note({ id: 'a', deletedAt: NOW + 1000 })] }
    const imported = { folders, notes: [note({ id: 'a' })] }
    expect(mergeData(current, imported).data.notes[0].deletedAt).toBe(NOW + 1000)
  })

  it('junta pastas com o mesmo id ou o mesmo nome e cria as que faltam', () => {
    const current = { folders: [...folders, { id: 'f1', name: 'Trabalho' }], notes: [] }
    const imported = {
      folders: [...folders, { id: 'f2', name: ' trabalho ' }, { id: 'f3', name: 'Viagem' }],
      notes: [note({ id: 'a', folderId: 'f2' }), note({ id: 'b', folderId: 'f3' }), note({ id: 'c', folderId: 'sumiu' })],
    }
    const { data } = mergeData(current, imported)
    expect(data.folders.map((f) => f.name)).toEqual(['Notas', 'Trabalho', 'Viagem'])
    expect(data.notes.map((n) => n.folderId)).toEqual(['f1', 'f3', DEFAULT_FOLDER])
  })

  it('ignora notas sem id ou sem texto', () => {
    const imported = { folders, notes: [null, { id: 'x' }, note({ id: 'ok' })] }
    expect(mergeData({ folders, notes: [] }, imported).data.notes.map((n) => n.id)).toEqual(['ok'])
  })

  it('resume o que foi importado', () => {
    expect(importMessage({ added: 0, updated: 0 })).toMatch(/Nenhuma novidade/)
    expect(importMessage({ added: 1, updated: 0 })).toBe('Importação concluída: 1 nota nova.')
    expect(importMessage({ added: 3, updated: 2 })).toBe('Importação concluída: 3 notas novas e 2 notas atualizadas.')
  })
})

describe('navegação rápida (Ctrl+P) e histórico (Alt+← / Alt+→)', () => {
  it('ordena resultados do Ctrl+P por relevância do título e ignora lixo e acentos', () => {
    const folders = [{ id: DEFAULT_FOLDER, name: 'Notas' }, { id: 'trab', name: 'Trabalho' }]
    const notes = [
      note({ id: 'body', text: 'Anotações\nfazer café' }),
      note({ id: 'mid', text: 'Hora do café' }),
      note({ id: 'start', text: 'Café da manhã' }),
      note({ id: 'trash', text: 'Café apagado', deletedAt: NOW }),
    ]
    expect(quickOpenNotes(notes, folders, 'cafe').map((r) => r.note.id)).toEqual(['start', 'mid', 'body'])
    expect(quickOpenNotes(notes, folders, 'trabalho')).toHaveLength(0)
  })

  it('navega no histórico pulando notas removidas', () => {
    let h = { stack: [], index: -1 }
    h = pushNavHistory(h, 'a')
    h = pushNavHistory(h, 'a') // não duplica seguida
    h = pushNavHistory(h, 'b')
    h = pushNavHistory(h, 'c')
    expect(h).toEqual({ stack: ['a', 'b', 'c'], index: 2 })

    // Se "b" foi para o lixo, voltar pula direto para "a"
    const valid = new Set(['a', 'c'])
    const back = stepNavHistory(h, -1, valid)
    expect(back.noteId).toBe('a')
    expect(back.history.index).toBe(0)

    // Abrir "d" a partir de "a" descarta o futuro antigo
    const branched = pushNavHistory(back.history, 'd')
    expect(branched).toEqual({ stack: ['a', 'd'], index: 1 })
  })
})

describe('mover e duplicar nota', () => {
  const base = () => ({
    folders: [
      { id: DEFAULT_FOLDER, name: 'Notas' },
      { id: 'trabalho', name: 'Trabalho' },
    ],
    notes: [
      note({
        id: 'a',
        folderId: DEFAULT_FOLDER,
        pinned: true,
        createdAt: NOW - 5 * DAY,
        updatedAt: NOW - 2 * DAY,
        html: '<p>Relatório</p><img src="notas://anexos/ab12cd34-grafico.png">',
        text: 'Relatório\nResumo mensal',
      }),
      note({ id: 'lixo', folderId: DEFAULT_FOLDER, deletedAt: NOW - DAY, text: 'Apagada' }),
    ],
  })

  it('move a nota para outra pasta existente sem mexer na data de edição nem no fixar', () => {
    const data = base()
    const next = moveNote(data, 'a', 'trabalho')
    const moved = next.notes.find((n) => n.id === 'a')
    expect(moved.folderId).toBe('trabalho')
    expect(moved.updatedAt).toBe(NOW - 2 * DAY)
    expect(moved.pinned).toBe(true)
    expect(filterNotes(next.notes, { folderId: 'trabalho' }).map((n) => n.id)).toEqual(['a'])
    expect(filterNotes(next.notes, { folderId: DEFAULT_FOLDER })).toHaveLength(0)
  })

  it('ignora mover para a mesma pasta, pasta inexistente, virtual (ALL/TRASH) ou nota no lixo', () => {
    const data = base()
    expect(moveNote(data, 'a', DEFAULT_FOLDER)).toBe(data)
    expect(moveNote(data, 'a', 'inexistente')).toBe(data)
    expect(moveNote(data, 'a', ALL)).toBe(data)
    expect(moveNote(data, 'a', TRASH)).toBe(data)
    expect(moveNote(data, 'lixo', 'trabalho')).toBe(data)
    expect(moveNote(data, 'desconhecida', 'trabalho')).toBe(data)
  })

  it('duplica nota com novo id, mesma pasta, conteúdo e anexos preservados, datas novas e sem fixar', () => {
    const data = base()
    const { data: next, note: copy } = duplicateNote(data, 'a', NOW, 'copia-1')
    expect(copy).not.toBeNull()
    expect(copy.id).toBe('copia-1')
    expect(copy.folderId).toBe(DEFAULT_FOLDER)
    expect(copy.text).toBe('Relatório\nResumo mensal')
    expect(copy.html).toBe('<p>Relatório</p><img src="notas://anexos/ab12cd34-grafico.png">')
    expect(copy.createdAt).toBe(NOW)
    expect(copy.updatedAt).toBe(NOW)
    expect(copy.pinned).toBe(false)
    // A nota original permanece intacta e os anexos continuam apontando para o mesmo endereço.
    expect(next.notes.find((n) => n.id === 'a').updatedAt).toBe(NOW - 2 * DAY)
    expect(attachmentUrls(next.notes)).toEqual(['notas://anexos/ab12cd34-grafico.png'])
  })

  it('não duplica nota inexistente nem nota na lixeira', () => {
    const data = base()
    expect(duplicateNote(data, 'lixo', NOW, 'x')).toEqual({ data, note: null })
    expect(duplicateNote(data, 'sumiu', NOW, 'x')).toEqual({ data, note: null })
  })
})

describe('ordenação da lista e grupos', () => {
  const sample = () => [
    note({ id: 'pin-z', pinned: true, text: 'Zebra', createdAt: NOW - 10 * DAY, updatedAt: NOW - 8 * DAY }),
    note({ id: 'pin-a', pinned: true, text: 'Água', createdAt: NOW - 3 * DAY, updatedAt: NOW - 9 * DAY }),
    note({ id: 'n10', text: 'Nota 10', createdAt: NOW - 1 * DAY, updatedAt: NOW - 5 * DAY }),
    note({ id: 'n2', text: 'nota 2', createdAt: NOW - 4 * DAY, updatedAt: NOW }),
    note({ id: 'cafe', text: 'Café', createdAt: NOW - 2 * DAY, updatedAt: NOW - 3 * DAY }),
  ]

  it('valida opções de ordenação conhecidas', () => {
    expect(SORT_OPTIONS.map((o) => o.id)).toEqual(['updatedAt', 'createdAt', 'title'])
    expect(isValidSort(DEFAULT_SORT)).toBe(true)
    expect(isValidSort('createdAt')).toBe(true)
    expect(isValidSort('title')).toBe(true)
    expect(isValidSort('invalida')).toBe(false)
    expect(isValidSort(null)).toBe(false)
  })

  it('mantém fixadas no topo em todas as ordenações', () => {
    const notes = sample()
    expect(sortNotes(notes, 'updatedAt').map((n) => n.id)).toEqual(['pin-z', 'pin-a', 'n2', 'cafe', 'n10'])
    expect(sortNotes(notes, 'createdAt').map((n) => n.id)).toEqual(['pin-a', 'pin-z', 'n10', 'cafe', 'n2'])
    expect(sortNotes(notes, 'title').map((n) => n.id)).toEqual(['pin-a', 'pin-z', 'cafe', 'n2', 'n10'])
  })

  it('usa grupos por data apenas na ordenação por data de edição', () => {
    const notes = filterNotes(sample(), { sortBy: 'updatedAt' })
    expect(groupNotes(notes, NOW, 'updatedAt').map(([g]) => g)).toEqual(['Fixadas', 'Hoje', '7 Dias Anteriores'])

    // Em criação e título: separa Fixadas de Notas quando existem fixadas.
    const byCreated = filterNotes(sample(), { sortBy: 'createdAt' })
    expect(groupNotes(byCreated, NOW, 'createdAt').map(([g]) => g)).toEqual(['Fixadas', 'Notas'])

    const byTitle = filterNotes(sample(), { sortBy: 'title' })
    expect(groupNotes(byTitle, NOW, 'title').map(([g]) => g)).toEqual(['Fixadas', 'Notas'])

    // Sem fixadas, não cria cabeçalho redundante.
    const noPins = filterNotes(
      sample().filter((n) => !n.pinned),
      { sortBy: 'title' },
    )
    expect(groupNotes(noPins, NOW, 'title').map(([g]) => g)).toEqual([''])
  })

  it('na lixeira, ignora a ordenação escolhida e mantém ordem por data de exclusão sem cabeçalho', () => {
    const trashed = [
      note({ id: 't1', text: 'Alfa', deletedAt: NOW - 5 * DAY, createdAt: NOW }),
      note({ id: 't2', text: 'Zeta', deletedAt: NOW - DAY, createdAt: NOW - 10 * DAY }),
    ]
    const filtered = filterNotes(trashed, { folderId: TRASH, sortBy: 'title' })
    expect(filtered.map((n) => n.id)).toEqual(['t2', 't1'])
    expect(groupNotes(filtered, NOW, 'title')).toEqual([['', filtered]])
  })
})
