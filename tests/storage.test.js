import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import storage from '../electron/storage.cjs'

const { readNotes, saveNotes, stamp, urlsDeCopias } = storage

let dir
beforeEach(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notas-storage-'))))
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const file = () => path.join(dir, 'notes.json')
const tmp = () => path.join(dir, 'notes.json.tmp')
const notas = {
  folders: [{ id: 'notes', name: 'Notas' }],
  notes: [{ id: 'a', folderId: 'notes', pinned: false, html: '<p>oi</p>', text: 'oi' }],
}
const copias = () => fs.readdirSync(dir).filter((n) => n.startsWith('notes.corrompido-'))
const preservados = () => fs.readdirSync(dir).filter((n) => n.startsWith('notes.backup-antigo-'))

describe('leitura do notes.json', () => {
  it('primeira execução: sem arquivo, devolve vazio e não cria nada', () => {
    expect(readNotes(dir)).toEqual({ status: 'vazio', data: null, copia: null, backupAntigo: null })
    expect(fs.readdirSync(dir)).toEqual([])
  })

  it('arquivo válido: devolve as notas e guarda a cópia de segurança notes.backup.json', () => {
    fs.writeFileSync(file(), JSON.stringify(notas))
    const r = readNotes(dir)
    expect(r.status).toBe('ok')
    expect(r.data).toEqual(notas)
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'notes.backup.json'), 'utf8'))).toEqual(notas)
  })

  it('JSON inválido: gera a cópia notes.corrompido-<data-hora>.json e preserva o original', () => {
    const ruim = '{"folders": [{"id":'
    fs.writeFileSync(file(), ruim)
    const r = readNotes(dir)
    expect(r.status).toBe('corrompido')
    expect(r.data).toBeNull()
    expect(path.basename(r.copia)).toMatch(/^notes\.corrompido-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}\.json$/)
    expect(fs.readFileSync(r.copia, 'utf8')).toBe(ruim)
    expect(fs.readFileSync(file(), 'utf8')).toBe(ruim)
  })

  it('aceita o BOM (marca UTF-8 no começo) que alguns editores põem no arquivo', () => {
    fs.writeFileSync(file(), '﻿' + JSON.stringify(notas), 'utf8')
    expect(readNotes(dir).status).toBe('ok')
  })

  it('formato inesperado (folders/notes que não são listas) é tratado como corrompido', () => {
    fs.writeFileSync(file(), JSON.stringify({ folders: {}, notes: [] }))
    expect(readNotes(dir).status).toBe('corrompido')
    fs.writeFileSync(file(), JSON.stringify({ notes: [] }))
    expect(readNotes(dir).status).toBe('corrompido')
    fs.writeFileSync(file(), JSON.stringify(['não', 'são', 'notas']))
    expect(readNotes(dir).status).toBe('corrompido')
  })

  it('arquivo ruim com um .tmp válido: recupera as notas do .tmp e guarda a cópia do ruim', () => {
    const ruim = 'lixo'
    fs.writeFileSync(file(), ruim)
    fs.writeFileSync(tmp(), JSON.stringify(notas))
    const r = readNotes(dir)
    expect(r.status).toBe('recuperado')
    expect(r.data).toEqual(notas)
    expect(fs.readFileSync(r.copia, 'utf8')).toBe(ruim)
  })

  it('sem notes.json, mas com um .tmp válido (gravação parou no rename): recupera do .tmp', () => {
    fs.writeFileSync(tmp(), JSON.stringify(notas))
    const r = readNotes(dir)
    expect(r.status).toBe('recuperado')
    expect(r.data).toEqual(notas)
    expect(r.copia).toBeNull()
  })

  it('.tmp inválido não é usado para recuperar', () => {
    fs.writeFileSync(file(), 'lixo')
    fs.writeFileSync(tmp(), 'também lixo')
    expect(readNotes(dir).status).toBe('corrompido')
  })

  it('não sobrescreve cópias de corrupções anteriores', () => {
    fs.writeFileSync(file(), 'ruim')
    readNotes(dir)
    readNotes(dir)
    expect(copias()).toHaveLength(2)
  })

  it('se nem a cópia do arquivo ruim for possível, devolve erro (e o app não deve gravar)', () => {
    // Um diretório no lugar do notes.json: não dá para ler nem copiar, então é o caso de falha grave.
    fs.mkdirSync(file())
    const r = readNotes(dir)
    expect(r.status).toBe('erro')
    expect(r.data).toBeNull()
    expect(fs.statSync(file()).isDirectory()).toBe(true)
  })
})

describe('a última cópia boa não se perde', () => {
  it('abrir válido → arquivo estraga → abrir (vazio) → abrir válido de novo: a cópia de antes continua preservada', () => {
    // 1. Abertura válida: o notes.backup.json passa a guardar as notas originais.
    saveNotes(dir, notas)
    expect(readNotes(dir).status).toBe('ok')

    // 2. O arquivo estraga. O app abre com caderno novo, e o backup antigo é guardado antes de ser trocado.
    fs.writeFileSync(file(), 'lixo')
    const ruim = readNotes(dir)
    expect(ruim.status).toBe('corrompido')
    expect(ruim.backupAntigo).not.toBeNull()
    expect(preservados()).toHaveLength(1)

    // 3. O app grava o caderno novo e, na abertura seguinte, o arquivo é válido: o backup é trocado por ele.
    const novo = { folders: [{ id: 'notes', name: 'Notas' }], notes: [] }
    saveNotes(dir, novo)
    expect(readNotes(dir).status).toBe('ok')
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'notes.backup.json'), 'utf8'))).toEqual(novo)

    // Mas a cópia preservada ainda tem as notas originais.
    expect(JSON.parse(fs.readFileSync(ruim.backupAntigo, 'utf8'))).toEqual(notas)
  })

  it('sem backup anterior, não cria cópia de backup nenhuma', () => {
    fs.writeFileSync(file(), 'lixo')
    const r = readNotes(dir)
    expect(r.status).toBe('corrompido')
    expect(r.backupAntigo).toBeNull()
    expect(preservados()).toEqual([])
  })
})

describe('anexos guardados só nas cópias', () => {
  it('urlsDeCopias lê os endereços de notes.corrompido-*.json e notes.backup*.json, e ignora outros arquivos', () => {
    const html = (url) => JSON.stringify({ folders: [], notes: [{ html: `<img src="${url}">` }] })
    fs.writeFileSync(path.join(dir, 'notes.corrompido-2026-01-01_00-00-00-000.json'), '{"x": "notas://anexos/a1-foto.png\\"')
    fs.writeFileSync(path.join(dir, 'notes.backup.json'), html('notas://anexos/b2-planilha.xlsx'))
    fs.writeFileSync(path.join(dir, 'notes.backup-antigo-2026-01-01_00-00-00-000.json'), html('notas://anexos/c3-pdf.pdf'))
    fs.writeFileSync(path.join(dir, 'notes.json'), html('notas://anexos/d4-ignorado.png'))
    fs.writeFileSync(path.join(dir, 'outro.txt'), 'notas://anexos/e5-ignorado.png')

    expect(urlsDeCopias(dir).sort()).toEqual([
      'notas://anexos/a1-foto.png',
      'notas://anexos/b2-planilha.xlsx',
      'notas://anexos/c3-pdf.pdf',
    ])
  })

  it('pasta sem cópias: lista vazia', () => {
    expect(urlsDeCopias(dir)).toEqual([])
  })
})

describe('gravação atômica', () => {
  it('grava o JSON, cria a pasta se preciso e não deixa o .tmp para trás', () => {
    const pasta = path.join(dir, 'nova', 'pasta')
    saveNotes(pasta, notas)
    expect(JSON.parse(fs.readFileSync(path.join(pasta, 'notes.json'), 'utf8'))).toEqual(notas)
    expect(fs.existsSync(path.join(pasta, 'notes.json.tmp'))).toBe(false)
  })

  it('substitui o arquivo anterior por inteiro', () => {
    saveNotes(dir, notas)
    saveNotes(dir, { folders: [], notes: [] })
    expect(readNotes(dir).data).toEqual({ folders: [], notes: [] })
  })

  it('um .tmp deixado por gravação interrompida não atrapalha a leitura de um notes.json válido', () => {
    saveNotes(dir, notas)
    fs.writeFileSync(tmp(), '{"parcial')
    const r = readNotes(dir)
    expect(r.status).toBe('ok')
    expect(r.data).toEqual(notas)
  })
})

describe('stamp (data-hora do nome da cópia)', () => {
  it('não usa dois-pontos, que o Windows não aceita em nome de arquivo', () => {
    expect(stamp(new Date(2026, 10, 19, 14, 30, 5, 7))).toBe('2026-11-19_14-30-05-007')
  })
})
