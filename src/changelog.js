// Novidades de cada versão, mostradas na janela "Novidades" depois que o app se atualiza.
// Escreva para quem usa o app, não para quem programa. A versão mais nova fica em cima.
// Antes de `npm version`, adicione aqui a entrada da versão nova: sem ela os testes falham e o release não sai.
export const CHANGELOG = [
  {
    version: '1.5.0',
    items: [
      'O app ficou mais suave: a barra de pastas desliza ao abrir e fechar, e as notas se movem com animação ao apagar, fixar ou mudar de lugar.',
      'Agora, sempre que o Notas for atualizado, esta janela mostra o que há de novo. Para rever, clique em "Novidades", embaixo da barra de pastas.',
    ],
  },
  {
    version: '1.4.0',
    items: ['Exportar e importar as notas num arquivo .notas, para levar tudo para outro computador.'],
  },
  {
    version: '1.3.0',
    items: [
      'Lixeira: notas apagadas vão para "Apagadas Recentemente" e podem ser recuperadas por 30 dias.',
      'O app libera espaço sozinho, apagando imagens e arquivos que nenhuma nota usa mais.',
    ],
  },
  {
    version: '1.2.0',
    items: ['Atualizar ficou mais fácil: o app pergunta antes, mostra quanto falta para baixar e abre de novo sozinho.'],
  },
  {
    version: '1.1.0',
    items: ['Imagens, arquivos anexos e tabelas nas notas.', 'O app avisa quando sai uma versão nova.'],
  },
  {
    version: '1.0.2',
    items: ['Ficou mais fácil baixar o instalador da versão mais recente.'],
  },
  {
    version: '1.0.1',
    items: ['Correções no instalador.'],
  },
  {
    version: '1.0.0',
    items: ['Primeira versão: pastas, notas fixadas, busca, lista de verificação e formatação de texto.'],
  },
]

const parse = (v) => (/^\d+\.\d+\.\d+$/.test(v ?? '') ? v.split('.').map(Number) : null)

// Compara número a número: como texto, "1.10.0" viria antes de "1.9.0".
export function compareVersions(a, b) {
  const [x, y] = [parse(a), parse(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

// O que mostrar ao abrir: as entradas depois da última versão vista, até a atual, da mais nova para a mais antiga.
// Na primeira instalação (nada visto ainda) e fora do app (versão "web"), não mostra nada.
export function newsSince(changelog, lastSeen, current) {
  if (!parse(lastSeen) || !parse(current)) return []
  return changelog
    .filter((e) => compareVersions(e.version, lastSeen) > 0 && compareVersions(e.version, current) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version))
}
