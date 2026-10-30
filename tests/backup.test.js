import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import backup from '../electron/backup.cjs'

const { writeBackup, readBackup } = backup

let tmp
beforeEach(() => (tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notas-backup-'))))
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

const data = {
  folders: [{ id: 'notes', name: 'Notas' }],
  notes: [{ id: 'a', folderId: 'notes', html: '<img src="notas://anexos/a1-foto.png">', text: '' }],
}

describe('arquivo .notas', () => {
  it('ida e volta: exporta num PC e importa no outro com os anexos usados', () => {
    const origem = path.join(tmp, 'origem')
    fs.mkdirSync(origem)
    fs.writeFileSync(path.join(origem, 'a1-foto.png'), 'imagem')
    fs.writeFileSync(path.join(origem, 'b2-sem-uso.png'), 'lixo')
    const file = path.join(tmp, 'Notas.notas')
    writeBackup(file, data, origem, ['notas://anexos/a1-foto.png'])

    const destino = path.join(tmp, 'destino')
    expect(readBackup(file, destino)).toEqual(data)
    expect(fs.readdirSync(destino)).toEqual(['a1-foto.png'])
    expect(fs.readFileSync(path.join(destino, 'a1-foto.png'), 'utf8')).toBe('imagem')
  })

  it('não sobrescreve um anexo que já existe', () => {
    fs.writeFileSync(path.join(tmp, 'a1-foto.png'), 'imagem')
    const file = path.join(tmp, 'Notas.notas')
    writeBackup(file, data, tmp, ['notas://anexos/a1-foto.png'])
    fs.writeFileSync(path.join(tmp, 'a1-foto.png'), 'daqui')
    readBackup(file, tmp)
    expect(fs.readFileSync(path.join(tmp, 'a1-foto.png'), 'utf8')).toBe('daqui')
  })

  it('recusa arquivos que não são backup do Notas', () => {
    const texto = path.join(tmp, 'qualquer.notas')
    fs.writeFileSync(texto, 'não sou um zip')
    expect(() => readBackup(texto, tmp)).toThrow('não é um backup do Notas')

    const zip = new AdmZip()
    zip.addFile('notes.json', Buffer.from('{"outra":"coisa"}'))
    zip.writeZip(path.join(tmp, 'outro.notas'))
    expect(() => readBackup(path.join(tmp, 'outro.notas'), tmp)).toThrow('não é um backup do Notas')
  })

  it('ignora anexos com nomes que tentam sair da pasta', () => {
    const zip = new AdmZip()
    zip.addFile('notes.json', Buffer.from(JSON.stringify(data)))
    zip.addFile('anexos/..\..\perigo.txt', Buffer.from('x'))
    const file = path.join(tmp, 'adulterado.notas')
    zip.writeZip(file)
    const destino = path.join(tmp, 'anexos')
    readBackup(file, destino)
    expect(fs.readdirSync(destino)).toEqual([])
    expect(fs.existsSync(path.join(tmp, 'perigo.txt'))).toBe(false)
  })
})
