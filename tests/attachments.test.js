import { describe, it, expect } from 'vitest'
import path from 'node:path'
import attachments from '../electron/attachments.cjs'

const { safeFileName, storedName, urlFor, resolveAttachment, mimeFor } = attachments
const DIR = path.resolve('C:/Users/teste/AppData/Roaming/Notas/anexos')

describe('nomes de arquivo', () => {
  it('remove caracteres que o Windows não aceita', () => {
    expect(safeFileName('rel:atório?<2026>.pdf')).toBe('rel_atório__2026_.pdf')
    expect(safeFileName('../../segredo.txt')).toBe('_.._segredo.txt')
    expect(safeFileName('')).toBe('arquivo')
  })

  it('gera nomes diferentes para dois arquivos com o mesmo nome', () => {
    expect(storedName('foto.png')).not.toBe(storedName('foto.png'))
    expect(storedName('foto.png')).toMatch(/^[0-9a-f]{8}-foto\.png$/)
  })
})

describe('endereço notas://', () => {
  it('ida e volta: o endereço gerado aponta para o arquivo dentro da pasta de anexos', () => {
    const url = urlFor('abc12345-minha foto.png')
    expect(url).toBe('notas://anexos/abc12345-minha%20foto.png')
    expect(resolveAttachment(DIR, url)).toBe(path.join(DIR, 'abc12345-minha foto.png'))
  })

  it('recusa endereços que tentam sair da pasta de anexos', () => {
    expect(resolveAttachment(DIR, 'notas://anexos/..%2F..%2Fnotes.json')).toBeNull()
    expect(resolveAttachment(DIR, 'notas://anexos/..%5C..%5CWindows%5Cwin.ini')).toBeNull()
    // o próprio parser de URL remove o '..', então o caminho continua dentro da pasta de anexos
    expect(path.dirname(resolveAttachment(DIR, 'notas://anexos/../notes.json'))).toBe(DIR)
    expect(resolveAttachment(DIR, 'notas://anexos/')).toBeNull()
  })

  it('recusa outros esquemas e endereços inválidos', () => {
    expect(resolveAttachment(DIR, 'file:///C:/Windows/win.ini')).toBeNull()
    expect(resolveAttachment(DIR, 'notas://outro/arquivo.png')).toBeNull()
    expect(resolveAttachment(DIR, 'não é url')).toBeNull()
  })
})

describe('tipo do arquivo', () => {
  it('reconhece imagens e PDF pela extensão', () => {
    expect(mimeFor('Foto.JPG')).toBe('image/jpeg')
    expect(mimeFor('doc.pdf')).toBe('application/pdf')
    expect(mimeFor('planilha.xlsx')).toBe('application/octet-stream')
  })
})
