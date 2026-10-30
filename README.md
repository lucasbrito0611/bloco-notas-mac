<p align="center">
  <img src="build/icon.png" width="120" alt="Ícone do Notas" />
</p>

<h1 align="center">Notas</h1>

<p align="center">Um clone do app Notas do Mac, feito para o Windows.</p>

---

## O problema

O Bloco de Notas do Windows é muito limitado. Ele serve para abrir um `.txt` rápido, mas não organiza nada: não tem pastas, lista de notas, busca entre as notas, checklist nem formatação de verdade. Cada nota vira um arquivo solto que eu tenho que salvar e procurar depois.

Do outro lado, o **Notas do Mac** acerta em cheio. Você abre, escreve e pronto. Tudo fica salvo e organizado em pastas, a primeira linha vira o título, dá para fazer checklist e encontrar qualquer coisa pela busca. Ele é simples sem ser pobre.

Procurei algo assim para o Windows e não achei. Existem bons apps de notas, como o UpNote, o Notesnook e o Joplin, mas nenhum tem essa experiência. Ou são complexos demais, ou têm outra proposta, ou não têm a cara do Notas.

## A minha solução

Decidi construir o meu próprio. Este projeto recria a experiência do Notas do Mac como um app de desktop para Windows:

- **Três colunas**, como no Mac: pastas, lista de notas e editor.
- **A primeira linha vira o título** da nota automaticamente.
- **Salvamento automático**, sem botão de salvar e sem arquivos soltos.
- **Checklist** com as bolinhas amarelas do Notas.
- **Formatação**: título, cabeçalho, subcabeçalho, listas, negrito, itálico, sublinhado, tachado e texto monoespaçado.
- **Pastas** para organizar (criar, renomear e apagar).
- **Busca** que ignora acentos.
- **Notas fixadas** no topo e lista agrupada por data (Hoje, Ontem, 7 dias…).
- **Visual nativo do Windows 11**, com o efeito Mica na barra lateral e tema claro/escuro automático.

As notas ficam só no meu computador, em `%APPDATA%\Notas\notes.json`. Não tem conta, nuvem nem internet.

## Como foi feito

Eu venho do desenvolvimento web, então escolhi uma stack em que eu reaproveito o que já sei:

- **[Electron](https://www.electronjs.org/)**: transforma uma interface web num app de desktop (é o mesmo que o VS Code, o Discord e o Spotify usam).
- **[React](https://react.dev/)**: a interface.
- **[TipTap](https://tiptap.dev/)**: o editor de texto rico.
- **[Vite](https://vite.dev/)**: o build do frontend.

```
electron/main.cjs     → cria a janela e salva as notas no disco (o "backend" local)
electron/preload.cjs  → a ponte segura entre a interface e o disco
src/App.jsx           → a interface: pastas, lista de notas e editor
src/styles.css        → o visual
build/icon.svg        → o ícone do app
```

## Baixar

**[⬇️ Baixar o Notas para Windows](https://github.com/lucasbrito0611/bloco-notas-mac/releases/latest/download/Notas-Setup.exe)**

Esse link sempre baixa a versão mais recente. É só abrir o `Notas-Setup.exe` e instalar. Depois disso, o app se atualiza sozinho: quando sai uma versão nova, ele baixa em segundo plano e instala quando você fecha. As versões anteriores ficam na página de [Releases](https://github.com/lucasbrito0611/bloco-notas-mac/releases).

> Na primeira vez, o Windows pode mostrar **"O Windows protegeu o computador"**. Isso acontece porque o instalador não tem assinatura digital paga. Clique em **Mais informações → Executar assim mesmo**.

## Rodando na sua máquina

Você precisa do [Node.js](https://nodejs.org/) instalado.

```bash
git clone https://github.com/lucasbrito0611/bloco-notas-mac.git
cd bloco-notas-mac
npm install
npm start
```

Para desenvolver com recarga automática:

```bash
npm run dev
```

## Atalhos

| Atalho | Ação |
|---|---|
| `Ctrl+N` | Nova nota |
| `Ctrl+Shift+N` | Nova pasta |
| `Ctrl+F` | Buscar |
| `Ctrl+Shift+L` | Lista de verificação |
| Duplo clique na pasta | Renomear |

## Como eu lanço uma versão nova

Cada versão vira um instalador automaticamente pelo GitHub Actions:

```bash
npm version patch
```
```bash
git push --follow-tags
```

O GitHub gera o `.exe`, publica nos Releases, e quem já tem o app instalado recebe a atualização sozinho.

## Ícone

O ícone fica em `build/icon.svg`. Depois de editar, rode `npm run icon` para gerar o `icon.ico` e o `icon.png`.

## Próximos passos

- [x] Instalador `.exe` com atualização automática
- [ ] Imagens e anexos nas notas
- [ ] Tabelas
- [ ] Lixeira ("Apagadas Recentemente")
- [ ] Sincronização entre computadores

---

Este é um projeto pessoal, sem relação com a Apple. O ícone e a interface foram feitos do zero, inspirados no Notas.
