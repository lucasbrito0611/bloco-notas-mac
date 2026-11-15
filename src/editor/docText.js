// Utilitários para mapear texto plano ↔ posições exatas do ProseMirror dentro de blocos.

const WORD_CHAR = /[\p{L}\p{N}_]/u

export function blockTextMap(blockNode, contentStart) {
  let text = ''
  const runs = []
  blockNode.forEach((child, offset) => {
    const strStart = text.length
    if (child.isText) {
      text += child.text
      runs.push({ strStart, strEnd: text.length, pmStart: contentStart + offset })
    } else {
      // Quebras suaves (<br>) e átomos inline ocupam 1 posição no ProseMirror.
      text += child.type.name === 'hardBreak' ? '\n' : '\ufffc'
      runs.push({ strStart, strEnd: text.length, pmStart: contentStart + offset })
    }
  })

  const posAt = (strOffset) => {
    if (!runs.length) return contentStart
    for (const r of runs) {
      if (strOffset <= r.strEnd) return r.pmStart + Math.max(0, strOffset - r.strStart)
    }
    const last = runs[runs.length - 1]
    return last.pmStart + (last.strEnd - last.strStart)
  }

  return { text, runs, posAt }
}

// Encontra todas as ocorrências de `needle` no documento (dentro de blocos de texto, atravessando negrito/itálico etc.).
export function collectDocMatches(doc, needle, { caseSensitive = false } = {}) {
  if (!needle) return []
  const query = caseSensitive ? needle : needle.toLowerCase()
  if (!query) return []

  const matches = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const { text, posAt } = blockTextMap(node, pos + 1)
    const haystack = caseSensitive ? text : text.toLowerCase()
    // Evita desalinhamento de índices se algum caractere raro mudar de tamanho ao virar minúsculo.
    if (haystack.length !== text.length) return false

    let idx = 0
    while (idx <= haystack.length - query.length) {
      const found = haystack.indexOf(query, idx)
      if (found === -1) break
      matches.push({ from: posAt(found), to: posAt(found + query.length) })
      idx = found + query.length
    }
    return false
  })
  return matches
}

// Retorna o intervalo da palavra sob `pos` (com suporte a acentos e Unicode), ou null se não houver palavra.
export function wordRangeAt(doc, pos) {
  const $pos = doc.resolve(pos)
  if (!$pos.parent.isTextblock) return null
  const contentStart = $pos.start()
  const { text, posAt } = blockTextMap($pos.parent, contentStart)
  const rel = pos - contentStart

  let start = rel
  let end = rel
  if (start > 0 && !WORD_CHAR.test(text[start] || '') && WORD_CHAR.test(text[start - 1])) {
    start -= 1
    end = start
  }
  if (!WORD_CHAR.test(text[start] || '')) return null

  while (start > 0 && WORD_CHAR.test(text[start - 1])) start -= 1
  while (end < text.length && WORD_CHAR.test(text[end])) end += 1
  if (start === end) return null

  return { from: posAt(start), to: posAt(end), text: text.slice(start, end) }
}

export function codeBlockLineRange(text, fromOffset, toOffset = fromOffset) {
  let start = text.lastIndexOf('\n', Math.max(0, fromOffset - 1))
  start = start === -1 ? 0 : start + 1

  // Se a seleção termina exatamente no início da próxima linha (ex.: após Ctrl+L), não inclui a linha seguinte à toa.
  const searchEndFrom = toOffset > fromOffset && text[toOffset - 1] === '\n' ? toOffset - 1 : toOffset
  let end = text.indexOf('\n', searchEndFrom)
  if (end === -1) end = text.length

  return { start, end }
}

