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
electron/main.cjs         processo principal: janela, notes.json, anexos, protocolo notas:// e atualizações
electron/preload.cjs      ponte segura (contextBridge) que expõe window.notesApi para a interface
electron/attachments.cjs  nomes de arquivo e conversão notas://anexos/<arquivo> → caminho (sem Electron, testável)
electron/backup.cjs       gera e lê o arquivo .notas de exportar/importar (sem Electron, testável)
src/App.jsx               a interface: pastas, lista de notas, editor, menus e aviso de atualização
src/notes.js              lógica pura das notas: título, prévia, nota vazia, datas, busca, grupos, pastas, lixeira
src/updates.js            estados do fluxo de atualização (modal, botão, download, instalação)
src/editor/extensions.js  lista de extensões do TipTap, usada pelo app e pelos testes
src/editor/attachment.js  nó "attachment" (cartão de PDF, planilha etc.)
src/styles.css            visual, com tokens de cor em :root e tema escuro via prefers-color-scheme
src/main.jsx              entrada do React; fora do Electron, cai num notesApi que usa localStorage
tests/                    testes unitários (Vitest)
build/icon.svg            fonte do ícone (desenho original, inspirado no Notas)
build/make-icon.cjs       gera build/icon.ico e build/icon.png a partir do SVG
.github/workflows/test.yml     roda os testes e o build em todo push na main e em PRs
.github/workflows/release.yml  roda os testes e, se passarem, gera e publica o instalador quando uma tag v* é enviada
```

A comunicação interface ↔ disco é feita por IPC: `window.notesApi.save(data)` → `ipcMain.handle('notes:save')`. É o equivalente local de um `fetch` para uma API.

API exposta em `window.notesApi`: `load`, `save`, `saveAttachment({ name, type, bytes })`, `openAttachment(url)`, `cleanupAttachments(urlsEmUso)`, `exportNotes(data, urlsEmUso)`, `importNotes()`, `version`, `getUpdate`, `downloadUpdate`, `installUpdate`, `onUpdate(callback)`.

Coloque lógica nova que não dependa de React ou Electron em `src/notes.js` (ou em `electron/attachments.cjs`, se for do lado do disco) e escreva testes para ela.

## Dados

- Todas as notas e pastas ficam num único arquivo: `%APPDATA%\Notas\notes.json`.
- Formato: `{ folders: [{ id, name }], notes: [{ id, folderId, pinned, createdAt, updatedAt, html, text, deletedAt? }] }`.
- `html` é o conteúdo do TipTap; `text` é o texto puro, usado para título, prévia e busca.
- A pasta com id `notes` é a padrão e não pode ser apagada; apagar outra pasta move as notas para ela.
- A gravação usa arquivo temporário + rename para não corromper o JSON.
- Anexos (imagens e arquivos) ficam em `%APPDATA%\Notas\anexos\<8 caracteres aleatórios>-<nome>`. A nota guarda só o endereço `notas://anexos/<arquivo>`, servido pelo `protocol.handle` em `main.cjs`.
- Imagens viram `<img src="notas://...">`; outros arquivos viram `<div data-attachment data-src data-name data-size>`, que abre com duplo clique (`shell.openPath`).
- Uma nota só é "vazia" (e some ao trocar de nota) se não tiver texto, imagem, anexo nem tabela (`isBlank` em `notes.js`).
- Não existe nuvem nem conta. Sincronização seria um recurso novo.

### Lixeira ("Apagadas Recentemente")

- Apagar uma nota não remove nada: só grava `deletedAt` (data em ms) e tira o `pinned`. A nota mantém o `folderId` de origem.
- `TRASH` (`'__trash__'`) é uma pasta virtual. `filterNotes` mostra notas com `deletedAt` **só** nela; em todas as outras pastas, na contagem e na busca, elas não aparecem. Use sempre `filterNotes`/`countNotes` em vez de filtrar `data.notes` na mão.
- A pasta "Apagadas Recentemente" só aparece na barra lateral quando tem alguma nota, como no Mac.
- No lixo, a nota abre só para leitura (`editable: false`) com o botão **Recuperar** (`restoreNote`), que devolve a nota para a pasta de origem, ou para "Notas" se essa pasta foi apagada.
- No lixo, o botão de lixeira apaga de vez (`deleteForever`), com confirmação. "Esvaziar" apaga todas (`emptyTrash`).
- Ao abrir o app, `purgeTrash` apaga de vez o que está no lixo há mais de 30 dias (`TRASH_DAYS`).
- Apagar uma pasta continua movendo as notas dela para "Notas", e não para o lixo.

### Exportar e importar (arquivo `.notas`)

É o jeito de levar as notas para outro computador, sem conta nem nuvem. Os botões ficam no pé da barra lateral.

- O `.notas` é um `.zip` (biblioteca `adm-zip`) com o `notes.json` e a pasta `anexos/`, só com os anexos que alguma nota usa. Gerado e lido em `electron/backup.cjs`.
- Importar copia os anexos para a pasta `anexos` (sem sobrescrever os que já existem, porque o nome tem prefixo aleatório e é o mesmo arquivo) e devolve as notas para a interface, que junta com as atuais usando `mergeData` em `notes.js`.
- `mergeData`: nota que não existe aqui entra; se a mesma nota (mesmo `id`) existe dos dois lados, fica a que mudou por último (o maior entre `updatedAt` e `deletedAt`). Pastas com o mesmo id ou o mesmo nome viram uma só; nota de pasta inexistente vai para "Notas".
- Importar nunca apaga nada. Uma nota apagada de vez aqui volta se estiver no arquivo importado.
- Depois de importar, o editor é recriado (`key` com o contador `imports`) para mostrar a versão nova da nota aberta.

### Limpeza de anexos

Depois de apagar algo de vez, e toda vez que o app abre, a interface manda para o `main.cjs` a lista de anexos ainda usados (`attachmentUrls`, que inclui as notas no lixo). O `main.cjs` apaga da pasta `anexos` os arquivos que não estão na lista (`orphanFiles`), **mas só os com mais de 1 hora**: um anexo recém-colado já está no disco, mas pode ainda não ter sido salvo na nota.

## Comandos

```bash
npm install
npm run dev     # Vite em localhost:5173 + Electron com recarga automática
npm start       # build do frontend e abre o app
npm test        # testes unitários (Vitest)
npm run dist    # roda os testes e gera o instalador em release/ (não publica)
npm run icon    # regenera icon.ico e icon.png depois de editar build/icon.svg
```

## Como lançar uma versão

A publicação é automática e acontece **por versão, não por commit**. Commits comuns na `main` não geram instalador.

```bash
npm version patch          # 1.0.0 → 1.0.1, faz commit e cria a tag v1.0.1
git push --follow-tags     # envia o commit e a tag
```

Quando a tag `v*` chega no GitHub, o workflow `Release` primeiro roda o `test.yml` (testes + build). **Se algum teste falhar, o release não começa e nada é publicado.** Se passarem, ele roda numa máquina Windows, gera `Notas-Setup.exe` com o electron-builder (`--publish never`) e depois usa o `gh` para criar a release (se ainda não existir) e anexar o `.exe`, o `.blockmap` e o `latest.yml`, repetindo até 5 vezes se a API do GitHub devolver erro 500. Se o job falhar mesmo assim, use "Re-run failed jobs" no Actions: ele continua de onde parou.

O instalador tem nome fixo, sem versão (`artifactName` em `package.json`), para que o link https://github.com/lucasbrito0611/bloco-notas-mac/releases/latest/download/Notas-Setup.exe sempre baixe a versão mais recente. Não coloque a versão de volta no nome. O texto de instruções no topo de cada release vem de `.github/release-notes.md`; as notas do que mudou são geradas automaticamente abaixo dele.

### Atualização automática (no app instalado)

O fluxo é o padrão dos apps de desktop (`setupUpdates` em `main.cjs`, só quando `app.isPackaged`; estados em `src/updates.js`, com testes):

1. Ao abrir, e depois a cada 4 horas, o app lê o `latest.yml` da última release. Ele **só verifica**, sem baixar nada (`autoDownload = false`).
2. Se houver versão nova, aparece um **modal** com "Atualizar" e "Agora não".
3. **Agora não** → nada é baixado nem instalado (`autoInstallOnAppQuit = false`) e aparece um botão **Atualizar** fixo no topo da janela, até o usuário atualizar. Se sair uma versão ainda mais nova, o modal volta.
4. **Atualizar** (no modal ou no botão) → baixa mostrando a porcentagem. Quando termina, a interface salva as notas na hora e chama `quitAndInstall(true, true)`: instala em silêncio e **reabre o app sozinho**.
5. Erro no download → modal de erro com "Tentar de novo". Erro ao só verificar (ex.: sem internet) é ignorado.

Como a verificação pode terminar antes de a interface abrir, o `main.cjs` guarda o último aviso e a interface o pede com `getUpdate()` ao carregar.

Histórico: até a v1.0.2 o app usava `checkForUpdatesAndNotify()` (notificação do Windows e instalação ao fechar). A v1.1.0 baixava sozinha e mostrava "Reiniciar" na barra lateral. O fluxo com modal vale a partir da v1.2.0.

**Como testar sem publicar e sem reinstalar o app do usuário:** gere o app empacotado fingindo ser uma versão antiga (`npx electron-builder --win --dir -c.extraMetadata.version=1.0.0`), crie `release/win-unpacked/resources/app-update.yml` com `owner`, `repo`, `provider: github` e um `updaterCacheDirName` próprio (o `--dir` não gera esse arquivo) e rode o `Notas.exe` com `NOTAS_DATA_DIR` apontando para uma pasta temporária. Para não instalar de verdade, troque o handler `update:install` no processo principal durante o teste.

Use `minor` para recursos novos e `patch` para correções. A versão do `package.json` precisa bater com a tag, por isso use sempre `npm version` em vez de criar a tag na mão.

## Armadilhas conhecidas

- **`ELECTRON_RUN_AS_NODE=1` no terminal do Claude.** O app do Claude é feito em Electron e deixa essa variável no ambiente, o que faz o `electron` rodar como Node puro (`app` fica `undefined`). Rode com `env -u ELECTRON_RUN_AS_NODE npx electron .`. No terminal normal do usuário isso não acontece.
- **TipTap 3 não põe `data-type="taskItem"` no `<li>`.** Para estilizar o checklist, use `ul[data-type='taskList'] > li`.
- **`dist/` é do Vite e `release/` é do electron-builder.** Não mude o `output` do electron-builder para `dist`, senão um apaga o outro.
- **Ícone da janela.** Instalado, o app usa o ícone embutido no `Notas.exe`; em desenvolvimento, aponta para `build/icon.ico`.
- **Não copie o ícone da Apple.** O ícone é um desenho próprio, porque o original é marca registrada.
- **Aviso do SmartScreen.** O instalador não tem assinatura digital, então o Windows mostra "O Windows protegeu o computador" na primeira execução ("Mais informações" → "Executar assim mesmo"). Resolver isso exige um certificado pago.
- **Notas vazias somem** ao trocar de nota, como no Mac. Isso é intencional (`selectNote` e `newNote` em `App.jsx`).
- **`setEditable` dispara o `onUpdate`.** No TipTap, `editor.setEditable(x)` emite o evento `update`, e o `onUpdate` do app grava `updatedAt = agora`. Use sempre `setEditable(x, false)`. Na v1.3.0 isso fazia toda nota aberta pular para "Hoje", e com a importação faria uma nota só vista "ganhar" de uma editada de verdade.
- **Comandos de tabela, um por vez.** `addRowAfter`, `addColumnAfter` etc. não funcionam encadeados na mesma `chain()` (as posições ficam desatualizadas e dá "Position out of range"). Rode um comando por chamada.
- **Testar o app sem mexer nas notas de verdade.** O app instalado e o `npm start` usam a mesma pasta `%APPDATA%\Notas`. Para testes, defina `NOTAS_DATA_DIR` com outra pasta (veja `main.cjs`).
- **Não deixe o electron-builder publicar sozinho** (`--publish always`). Ele envia os arquivos em paralelo, cada envio tenta criar a release e um deles quebra com "Unexpected end of JSON input". Por isso o workflow gera com `--publish never` e publica com `gh release create`.

## Próximos passos

A lista fica no [README.md](README.md), na seção "Próximos passos". Ao terminar um item, marque com `[x]` lá.

## Convenções

- Visual inspirado no Notas do Mac, mas com cara de Windows 11 (Mica, botões de janela nativos, fonte Segoe UI).
- Cor de destaque amarela (`--accent`). Sempre defina cores como variáveis em `:root` e o equivalente no tema escuro.
- Atalhos usam `Ctrl` (padrão do Windows), não `Cmd`.
- Mantenha o README em primeira pessoa, como se fosse o Lucas falando.
- **Commits saem só no nome do Lucas.** Não adicione `Co-Authored-By: Claude` nem "Generated with Claude Code" em commits ou PRs.
