// Exportar UMA nota como Markdown, texto simples ou PDF (e imprimir).
// Não confunda com backup.cjs, que leva TODAS as notas num arquivo .notas.
//
// Tudo aqui é lógica pura, sem Electron, para poder ser testado.
// A entrada é o JSON do TipTap (editor.getJSON()): uma árvore de nós como
// { type: 'paragraph', content: [{ type: 'text', text: 'oi', marks: [{ type: 'bold' }] }] }.
// Percorrer essa árvore é mais simples e mais fiel do que reinterpretar o HTML,
// e funciona no processo principal, que não tem DOM (é Node puro, não um navegador).

const MAX_NAME = 80
// Nomes que o Windows reserva para dispositivos: "CON.md" não pode ser criado.
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

// Nome de arquivo a partir do título da nota, seguro para o Windows.
function safeExportName(title) {
  let name = String(title || '')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (name.length > MAX_NAME) name = name.slice(0, MAX_NAME).trim()
  // O Windows ignora pontos e espaços no fim do nome ("nota." vira "nota").
  name = name.replace(/[. ]+$/, '')
  if (!name) return 'Nota'
  if (RESERVED.test(name.split('.')[0])) name = `${name}_`
  return name
}

// ---------- utilidades ----------

const children = (node) => node?.content || []
const plainTextOf = (node) => (node.type === 'text' ? node.text || '' : children(node).map(plainTextOf).join(''))

// Endereços (src) de imagens e anexos da nota, sem repetir, na ordem em que aparecem.
function assetSources(doc) {
  const found = []
  const walk = (node) => {
    if ((node.type === 'image' || node.type === 'attachment') && node.attrs?.src && !found.includes(node.attrs.src)) {
      found.push(node.attrs.src)
    }
    children(node).forEach(walk)
  }
  walk(doc)
  return found
}

// Os anexos ficam salvos como "a1b2c3d4-foto.png". Ao exportar, tiramos o prefixo aleatório
// e, se dois arquivos ficarem com o mesmo nome, numeramos: "foto.png", "foto (2).png".
function assetFileNames(storedNames) {
  const used = new Set()
  return storedNames.map((stored) => {
    const nice = String(stored).replace(/^[0-9a-f]{8}-/i, '') || 'arquivo'
    const dot = nice.lastIndexOf('.')
    const base = dot > 0 ? nice.slice(0, dot) : nice
    const ext = dot > 0 ? nice.slice(dot) : ''
    let name = nice
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} (${i})${ext}`
    used.add(name.toLowerCase())
    return name
  })
}

// ---------- Markdown ----------

// Escapa caracteres que o Markdown interpretaria como formatação.
const escapeMd = (text) => text.replace(/([\\`*_[\]<>~])/g, '\\$1')

// No começo da linha, "# ", "- ", "> " e "1. " virariam título, lista, citação…
function escapeLineStart(line) {
  return line.replace(/^(\s*)([#>+-]|\d+[.)])(?=\s|$)/, (_m, sp, mark) =>
    /\d/.test(mark) ? `${sp}${mark.slice(0, -1)}\\${mark.slice(-1)}` : `${sp}\\${mark}`,
  )
}

// Caminho de link em Markdown: espaços, parênteses e < > quebrariam o link, então viram %20, %28…
// O resto fica como está (acentos inclusive), para não codificar duas vezes um link que já veio com %20.
const mdUrl = (url) => String(url).replace(/[\s()<>]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)

// Marcas na ordem em que são abertas; o fechamento é na ordem inversa.
const MARKS = {
  bold: ['**', '**'],
  italic: ['*', '*'],
  strike: ['~~', '~~'],
  underline: ['<u>', '</u>'], // Markdown não tem sublinhado; HTML simples funciona na maioria dos leitores
}

function codeSpan(text) {
  const longest = Math.max(0, ...(text.match(/`+/g) || []).map((s) => s.length))
  const ticks = '`'.repeat(longest + 1)
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : ''
  return `${ticks}${pad}${text}${pad}${ticks}`
}

function inlineMd(nodes, ctx) {
  let out = ''
  for (const node of nodes) {
    if (node.type === 'hardBreak') {
      out += ctx.inTable ? '<br>' : '\\\n'
      continue
    }
    if (node.type !== 'text') {
      out += inlineMd(children(node), ctx)
      continue
    }
    const marks = node.marks || []
    const has = (t) => marks.find((m) => m.type === t)
    // "** negrito**" não funciona em Markdown: os espaços das pontas ficam fora das marcas.
    const [, lead, core, trail] = node.text.match(/^(\s*)([\s\S]*?)(\s*)$/)
    if (!core) {
      out += node.text
      continue
    }
    let text = has('code') ? codeSpan(core) : escapeMd(core)
    if (ctx.inTable) text = text.replace(/\|/g, '\\|')
    for (const type of Object.keys(MARKS)) {
      if (has(type)) text = `${MARKS[type][0]}${text}${MARKS[type][1]}`
    }
    const link = has('link')
    if (link?.attrs?.href) text = `[${text}](${mdUrl(link.attrs.href)})`
    out += lead + text + trail
  }
  return out
}

const indentLines = (text, prefix) =>
  text
    .split('\n')
    .map((l, i) => (i === 0 || !l ? l : prefix + l))
    .join('\n')

function listMd(node, ctx) {
  let n = node.attrs?.start ?? 1
  return children(node)
    .map((item) => {
      let marker = '- '
      if (node.type === 'orderedList') marker = `${n++}. `
      if (item.type === 'taskItem') marker = item.attrs?.checked ? '- [x] ' : '- [ ] '
      // Blocos dentro do item ficam recuados para continuar dentro dele (listas aninhadas).
      const pad = ' '.repeat(node.type === 'orderedList' ? marker.length : 2)
      const body = children(item)
        .map((child) => blockMd(child, ctx))
        .filter((s) => s !== null)
        .join('\n')
      return marker + indentLines(body, pad)
    })
    .join('\n')
}

function tableMd(node, ctx) {
  const rows = children(node).map((row) =>
    children(row).flatMap((cell) => {
      const text = children(cell)
        .map((p) => inlineMd(children(p), { ...ctx, inTable: true }))
        .filter(Boolean)
        .join('<br>')
      // Célula mesclada: o Markdown não tem, então repetimos células vazias para manter as colunas.
      return [text || ' ', ...Array(Math.max(0, (cell.attrs?.colspan || 1) - 1)).fill(' ')]
    }),
  )
  if (!rows.length) return null
  const cols = Math.max(...rows.map((r) => r.length))
  const line = (cells) => `| ${[...cells, ...Array(cols - cells.length).fill(' ')].join(' | ')} |`
  // Markdown exige uma linha de cabeçalho; a primeira linha da tabela faz esse papel.
  return [line(rows[0]), line(Array(cols).fill('---')), ...rows.slice(1).map(line)].join('\n')
}

// Devolve o Markdown do bloco, ou null para não gerar nada (ex.: parágrafo vazio).
function blockMd(node, ctx) {
  switch (node.type) {
    case 'paragraph': {
      const text = inlineMd(children(node), ctx)
      return text ? text.split('\n').map(escapeLineStart).join('\n') : null
    }
    case 'heading': {
      const text = inlineMd(children(node), ctx).replace(/\\\n/g, ' ')
      return text ? `${'#'.repeat(node.attrs?.level || 1)} ${text}` : null
    }
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return listMd(node, ctx)
    case 'blockquote': {
      const inner = blocksMd(children(node), ctx)
      return inner
        .split('\n')
        .map((l) => (l ? `> ${l}` : '>'))
        .join('\n')
    }
    case 'codeBlock': {
      const code = plainTextOf(node)
      const longest = Math.max(2, ...(code.match(/`+/g) || []).map((s) => s.length))
      const fence = '`'.repeat(longest + 1)
      return `${fence}${node.attrs?.language || ''}\n${code}\n${fence}`
    }
    case 'horizontalRule':
      return '---'
    case 'image': {
      const alt = escapeMd(node.attrs?.alt || 'Imagem')
      const path = ctx.assetPath(node.attrs?.src)
      return path ? `![${alt}](${mdUrl(path)})` : `*[${alt}]*`
    }
    case 'attachment': {
      const name = escapeMd(node.attrs?.name || 'arquivo')
      const path = ctx.assetPath(node.attrs?.src)
      return path ? `[📎 ${name}](${mdUrl(path)})` : `📎 ${name}`
    }
    case 'table':
      return tableMd(node, ctx)
    default:
      return children(node).length ? blocksMd(children(node), ctx) || null : null
  }
}

const blocksMd = (nodes, ctx) =>
  nodes
    .map((n) => blockMd(n, ctx))
    .filter((s) => s !== null)
    .join('\n\n')

// assetPath(src) devolve o caminho relativo da imagem/anexo já copiado (ex.: "Compras.assets/foto.png"),
// ou null se o arquivo não foi copiado. Links da web (http/https) são mantidos como estão.
function toMarkdown(doc, { assetPath = () => null } = {}) {
  const ctx = { assetPath: (src) => assetPath(src) || (/^https?:\/\//i.test(src || '') ? src : null) }
  const md = blocksMd(children(doc), ctx)
  return md ? `${md}\n` : ''
}

// ---------- texto simples ----------

function inlineText(nodes) {
  return nodes.map((n) => (n.type === 'hardBreak' ? '\n' : n.type === 'text' ? n.text || '' : inlineText(children(n)))).join('')
}

function blockText(node, depth) {
  const pad = '  '.repeat(depth)
  switch (node.type) {
    case 'paragraph':
    case 'heading': {
      const indent = '    '.repeat(node.attrs?.indent || 0)
      return inlineText(children(node))
        .split('\n')
        .map((l) => (l ? indent + l : l))
        .join('\n')
    }
    case 'bulletList':
    case 'orderedList':
    case 'taskList': {
      let n = node.attrs?.start ?? 1
      return children(node)
        .map((item) => {
          let marker = '• '
          if (node.type === 'orderedList') marker = `${n++}. `
          if (item.type === 'taskItem') marker = item.attrs?.checked ? '[x] ' : '[ ] '
          const [first, ...rest] = children(item)
          const head = first ? blockText(first, 0) : ''
          const tail = rest.map((c) => blockText(c, depth + 1))
          return [pad + marker + head, ...tail].join('\n')
        })
        .join('\n')
    }
    case 'blockquote':
      return blocksText(children(node), depth)
        .split('\n')
        .map((l) => `> ${l}`.trimEnd())
        .join('\n')
    case 'codeBlock':
      return plainTextOf(node)
    case 'horizontalRule':
      return '──────────'
    case 'image':
      return node.attrs?.alt ? `[Imagem: ${node.attrs.alt}]` : '[Imagem]'
    case 'attachment':
      return `📎 ${node.attrs?.name || 'arquivo'}`
    case 'table':
      // Colunas separadas por tabulação: fica alinhado no Bloco de Notas e cola certinho no Excel.
      return children(node)
        .map((row) =>
          children(row)
            .map((cell) => children(cell).map((p) => inlineText(children(p)).replace(/\n/g, ' ')).join(' '))
            .join('\t'),
        )
        .join('\n')
    default:
      return blocksText(children(node), depth)
  }
}

const blocksText = (nodes, depth) => nodes.map((n) => blockText(n, depth)).join('\n')

// Cada bloco numa linha, como aparece na nota; linhas em branco que você deixou são mantidas.
function toPlainText(doc) {
  const text = blocksText(children(doc), 0).replace(/\s+$/, '')
  return text ? `${text}\n` : ''
}

// ---------- PDF e impressão ----------

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// CSS de impressão: sempre claro (papel é branco), sem nada da interface do app.
const PRINT_CSS = `
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  margin: 0; color: #1d1d1f; background: #fff;
  font: 11pt/1.5 'Inter Variable', 'Segoe UI', system-ui, sans-serif;
  font-feature-settings: 'cv11';
  overflow-wrap: anywhere;
}
h1, h2, h3 { line-height: 1.25; margin: 1.1em 0 0.4em; break-after: avoid; page-break-after: avoid; }
h1 { font-size: 20pt; font-weight: 700; }
h2 { font-size: 15pt; font-weight: 650; }
h3 { font-size: 12.5pt; font-weight: 650; }
body > :first-child { margin-top: 0; }
p { margin: 0 0 0.35em; orphans: 3; widows: 3; }
p:empty::before { content: '\\00a0'; }
a { color: #0a58ca; text-decoration: underline; }
s { color: #6e6e73; }
code { font-family: 'Cascadia Mono', Consolas, monospace; font-size: 0.9em; background: #f2f2f4; padding: 0.05em 0.3em; border-radius: 3px; }
pre { font-family: 'Cascadia Mono', Consolas, monospace; font-size: 9.5pt; background: #f5f5f7; border: 1px solid #e3e3e6;
  border-radius: 6px; padding: 8px 10px; white-space: pre-wrap; break-inside: avoid; page-break-inside: avoid; }
pre code { background: none; padding: 0; font-size: inherit; }
blockquote { margin: 0.5em 0; padding: 0.1em 0 0.1em 12px; border-left: 3px solid #d2d2d7; color: #48484a; }
hr { border: 0; border-top: 1px solid #d2d2d7; margin: 1em 0; }
ul, ol { margin: 0.2em 0 0.5em; padding-left: 1.5em; }
li { margin: 0.1em 0; break-inside: avoid; page-break-inside: avoid; }
li > p { margin: 0; }
ul[data-type='taskList'] { list-style: none; padding-left: 0.2em; }
ul[data-type='taskList'] ul[data-type='taskList'] { padding-left: 1.5em; }
ul[data-type='taskList'] > li { display: flex; align-items: flex-start; gap: 0.5em; }
ul[data-type='taskList'] > li > label { flex: none; margin-top: 0.22em; }
ul[data-type='taskList'] > li > label > span { display: none; }
ul[data-type='taskList'] > li > label > input { width: 1em; height: 1em; margin: 0; accent-color: #b8860b; }
ul[data-type='taskList'] > li > div { flex: 1; min-width: 0; }
ul[data-type='taskList'] > li[data-checked='true'] > div { color: #6e6e73; text-decoration: line-through; }
table { border-collapse: collapse; width: 100%; margin: 0.6em 0; font-size: 10pt; table-layout: auto; }
table, colgroup, col { min-width: 0 !important; }
tr { break-inside: avoid; page-break-inside: avoid; }
thead { display: table-header-group; }
th, td { border: 1px solid #c7c7cc; padding: 4px 7px; vertical-align: top; text-align: left; }
th { background: #f2f2f4; font-weight: 600; }
td > p, th > p { margin: 0; }
img { display: block; max-width: 100%; max-height: 240mm; height: auto; margin: 0.5em 0; break-inside: avoid; page-break-inside: avoid; }
/* Anexos que não são imagem viram uma linha com o nome do arquivo. */
div[data-attachment] { margin: 0.35em 0; color: #3a3a3c; }
div[data-attachment]::before { content: '📎 '; }
div[data-attachment] .att-icon, div[data-attachment] .att-size { display: none; }
`

// Página HTML completa que a janela oculta transforma em PDF (ou manda para a impressora).
// fontCss: as regras @font-face da Inter, já com a fonte embutida (montadas no main.cjs).
// A política de segurança (CSP) proíbe scripts e qualquer outra coisa de fora. Só passam imagens:
// as dos anexos (notas://) e as coladas da web (http/https), que o editor também mostra.
function buildPrintHtml({ title, html, fontCss = '' }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src notas: data: https: http:; style-src 'unsafe-inline'; font-src data:">
<title>${escapeHtml(title || 'Nota')}</title>
<style>${fontCss}${PRINT_CSS}</style>
</head>
<body>${html || ''}</body>
</html>
`
}

module.exports = {
  safeExportName,
  assetSources,
  assetFileNames,
  toMarkdown,
  toPlainText,
  buildPrintHtml,
  escapeHtml,
}
