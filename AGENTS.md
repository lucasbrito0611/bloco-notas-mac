# AGENTS.md

Guia para agentes de IA (e pessoas) que forem trabalhar neste projeto.

## O que é

**Notas**: um clone do app Notas do Mac para Windows. O objetivo é recriar a experiência do Notas (simples, rápido, organizado) porque o Bloco de Notas do Windows é limitado e as alternativas existentes não têm essa cara. O porquê completo está no [README.md](README.md).

- Repositório: https://github.com/lucasbrito0611/bloco-notas-mac (público, branch única `main`)
- Dono: Lucas Brito. Ele vem do desenvolvimento web e este é o primeiro app de desktop dele, então explique decisões com comparações com a web.
- Idioma: interface, README, mensagens de commit e comentários do código em **português**.

## Stack

| Peça | Papel |
|---|---|
| Electron | Transforma a interface web num app de desktop (Chromium + Node) |
| React 18 | Interface |
| TipTap 3 | Editor de texto rico (por cima do ProseMirror) |
| Vite | Build do frontend para `dist/` |
| electron-builder | Gera o instalador `.exe` (NSIS) em `release/` |
| electron-updater | Atualização automática pelo GitHub Releases |

Escolhemos Electron em vez de Tauri porque é tudo JavaScript e não exige Rust nem Build Tools do Visual Studio. Migrar para Tauri depois é barato: só `electron/` precisaria ser reescrito.

## Estrutura

```
electron/main.cjs     processo principal: cria a janela, lê/grava notes.json, verifica atualizações
electron/preload.cjs  ponte segura (contextBridge) que expõe window.notesApi.load/save para a interface
src/App.jsx           a interface inteira: pastas, lista de notas, editor e atalhos
src/styles.css        visual, com tokens de cor em :root e tema escuro via prefers-color-scheme
src/main.jsx          entrada do React; fora do Electron, cai num notesApi que usa localStorage
build/icon.svg        fonte do ícone (desenho original, inspirado no Notas)
build/make-icon.cjs   gera build/icon.ico e build/icon.png a partir do SVG
.github/workflows/release.yml  gera e publica o instalador quando uma tag v* é enviada
```

A comunicação interface ↔ disco é feita por IPC: `window.notesApi.save(data)` → `ipcMain.handle('notes:save')`. É o equivalente local de um `fetch` para uma API.

## Dados

- Todas as notas e pastas ficam num único arquivo: `%APPDATA%\Notas\notes.json`.
- Formato: `{ folders: [{ id, name }], notes: [{ id, folderId, pinned, createdAt, updatedAt, html, text }] }`.
- `html` é o conteúdo do TipTap; `text` é o texto puro, usado para título, prévia e busca.
- A pasta com id `notes` é a padrão e não pode ser apagada; apagar outra pasta move as notas para ela.
- A gravação usa arquivo temporário + rename para não corromper o JSON.
- Não existe nuvem nem conta. Sincronização seria um recurso novo.

## Comandos

```bash
npm install
npm run dev     # Vite em localhost:5173 + Electron com recarga automática
npm start       # build do frontend e abre o app
npm run dist    # gera o instalador em release/ (não publica)
npm run icon    # regenera icon.ico e icon.png depois de editar build/icon.svg
```

## Como lançar uma versão

A publicação é automática e acontece **por versão, não por commit**. Commits comuns na `main` não geram instalador.

```bash
npm version patch          # 1.0.0 → 1.0.1, faz commit e cria a tag v1.0.1
git push --follow-tags     # envia o commit e a tag
```

Quando a tag `v*` chega no GitHub, o workflow `Release` roda numa máquina Windows, gera `Notas-Setup-<versão>.exe` e publica no GitHub Releases junto com o `latest.yml`.

Os apps já instalados leem o `latest.yml` ao abrir, baixam a versão nova em segundo plano e instalam quando o app é fechado (`autoUpdater.checkForUpdatesAndNotify()` em `main.cjs`, só quando `app.isPackaged`).

Use `minor` para recursos novos e `patch` para correções. A versão do `package.json` precisa bater com a tag, por isso use sempre `npm version` em vez de criar a tag na mão.

## Armadilhas conhecidas

- **`ELECTRON_RUN_AS_NODE=1` no terminal do Claude.** O app do Claude é feito em Electron e deixa essa variável no ambiente, o que faz o `electron` rodar como Node puro (`app` fica `undefined`). Rode com `env -u ELECTRON_RUN_AS_NODE npx electron .`. No terminal normal do usuário isso não acontece.
- **TipTap 3 não põe `data-type="taskItem"` no `<li>`.** Para estilizar o checklist, use `ul[data-type='taskList'] > li`.
- **`dist/` é do Vite e `release/` é do electron-builder.** Não mude o `output` do electron-builder para `dist`, senão um apaga o outro.
- **Ícone da janela.** Instalado, o app usa o ícone embutido no `Notas.exe`; em desenvolvimento, aponta para `build/icon.ico`.
- **Não copie o ícone da Apple.** O ícone é um desenho próprio, porque o original é marca registrada.
- **Aviso do SmartScreen.** O instalador não tem assinatura digital, então o Windows mostra "O Windows protegeu o computador" na primeira execução ("Mais informações" → "Executar assim mesmo"). Resolver isso exige um certificado pago.
- **Notas vazias somem** ao trocar de nota, como no Mac. Isso é intencional (`selectNote` e `newNote` em `App.jsx`).

## Convenções

- Visual inspirado no Notas do Mac, mas com cara de Windows 11 (Mica, botões de janela nativos, fonte Segoe UI).
- Cor de destaque amarela (`--accent`). Sempre defina cores como variáveis em `:root` e o equivalente no tema escuro.
- Atalhos usam `Ctrl` (padrão do Windows), não `Cmd`.
- Mantenha o README em primeira pessoa, como se fosse o Lucas falando.
