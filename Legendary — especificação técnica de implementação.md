# Legendary — especificação técnica de implementação

Nov 6, 2026 · @Lucas

## Stack

O projeto é todo em TypeScript, num monorepo com pnpm: um app Electron para macOS, uma extensão de Chrome e pacotes compartilhados. As versões abaixo são o mínimo de partida. Ao criar o projeto, use a última versão estável de cada uma e fixe-as no lockfile.

| Camada | Tecnologia | Versão de partida | Por quê |
| --- | --- | --- | --- |
| Linguagem | TypeScript (modo `strict`) | 5.x | Tipos compartilhados entre app, extensão e pacotes |
| Runtime desktop | [Electron](https://www.electronjs.org/es/docs/latest/tutorial/electron-timelines) | ≥ 43 | Janela transparente, vibrancy do macOS e acesso ao sistema |
| Build do app | [electron-vite](https://github.com/microsoft/dynwinrt/pull/8) + Vite | 5.x + Vite 7 ou 8 | Build rápido de main, preload e renderer, com hot reload |
| UI | React + Tailwind CSS | 19 + 4 | Componentes do overlay, quiz e histórico |
| Animações | Motion (antigo Framer Motion) | 12 | Entrada e saída dos cards |
| Estado da UI | Zustand | 5 | Estado simples por janela, sem boilerplate |
| Banco | [better-sqlite3](https://backiee.wasmer.app/http_github_com/WiseLibs/better-sqlite3/releases) | 12 | Driver SQLite síncrono e o mais rápido para Node |
| ORM e migrações | [Drizzle ORM](https://central.sonatype.com/artifact/org.mvnpm/drizzle-orm/) + drizzle-kit | 0.45 | Schema tipado em TS e migrações geradas |
| IA | [AI SDK da Vercel](https://releasealert.dev/npmjs/_/ai?page=20) (`ai`) + `@ai-sdk/google`, `@ai-sdk/anthropic`, `@ai-sdk/deepseek` | 6 | Uma interface única para Gemini, Claude e DeepSeek, com saída estruturada |
| Validação | Zod | 4 | Schemas das respostas da IA e das mensagens IPC |
| NLP | wink-nlp + wink-eng-lite-web-model | 2 | Tokenização, lematização e classe gramatical, tudo local |
| Extensão | WXT (Manifest V3) | 0.20+ | Framework para extensões com Vite e TypeScript |
| Comunicação extensão → app | `ws` (WebSocket local) | 8 | Canal simples em `127.0.0.1` |
| Captura de áudio (fase 4) | Helper em Swift com ScreenCaptureKit + whisper.cpp | macOS 13+ | Transcrição local do áudio do sistema |
| Empacotamento | electron-builder | 26 | Gera `.dmg`, assina e faz notarização |
| Testes | Vitest + Playwright (modo Electron) | 3 + 1.5x | Unidade, integração e ponta a ponta |
| Lint e formatação | ESLint (flat config) + Prettier | 9 + 3 | Padrão único no monorepo |
| Commits | commitlint + lefthook | 19 + 1 | Valida o padrão de commits no `commit-msg` |

**Requisitos do ambiente:** macOS 13 ou mais novo, Node.js 22 LTS, pnpm 10 e Xcode Command Line Tools (necessário para compilar o better-sqlite3 e o helper em Swift).

## Arquitetura

O app segue o modelo de processos do Electron com uma regra rígida: só o processo main acessa o banco, a rede e a API key. As janelas React só exibem dados e enviam ações pelo preload.

&#91;embedded content: arquitetura · fontes, processo main, preload e renderers\]

As legendas entram pela captura, passam pelo pipeline (a lógica pura de `packages/core`, em destaque) e chegam aos serviços, que consultam o cache no SQLite, chamam a IA em lotes e mandam os cards para o overlay.

**Princípios:**

- **Domínio isolado:** pipeline, gerador de quiz e revisão espaçada são funções puras em `packages/core`, sem Electron nem I/O.
- **Portas e adaptadores:** captura (`CaptionSource`), IA (`LLMProvider`) e banco (repositórios) são interfaces. Trocar Netflix por áudio, ou Gemini por Claude, é trocar um adaptador.
- **Contratos únicos:** mensagens do WebSocket, canais IPC e respostas da IA têm schemas Zod em `packages/contracts`, usados dos dois lados.
- **Segurança por padrão:** `contextIsolation`, `sandbox`, CSP restrita nos renderers e WebSocket aceitando só `127.0.0.1` com token.

## Estrutura do repositório

Um monorepo pnpm com dois apps e três pacotes. A regra é simples: `packages/core` não conhece Electron, banco nem rede. Ele só recebe texto e devolve dados, e por isso é o pacote mais fácil de testar.

```
legendary/
├── apps/
│   ├── desktop/                 # App Electron
│   │   ├── src/
│   │   │   ├── main/            # Processo principal (Node)
│   │   │   │   ├── app/         # Ciclo de vida, tray, atalhos globais
│   │   │   │   ├── windows/     # overlay.ts, quiz.ts, history.ts, settings.ts
│   │   │   │   ├── capture/     # ws-server.ts, audio-source.ts
│   │   │   │   ├── services/    # session, vocabulary, quiz, settings
│   │   │   │   ├── ai/          # provider-factory.ts, prompts/, queue.ts
│   │   │   │   ├── db/          # client.ts, repositories/
│   │   │   │   └── ipc/         # handlers.ts (registra os canais tipados)
│   │   │   ├── preload/         # contextBridge: expõe a API tipada ao renderer
│   │   │   └── renderer/        # React
│   │   │       ├── overlay/     # Barra de status + cards
│   │   │       ├── quiz/
│   │   │       ├── history/
│   │   │       ├── settings/
│   │   │       └── shared/      # Componentes e hooks comuns
│   │   ├── native/
│   │   │   └── audio-helper/    # Swift + ScreenCaptureKit (fase 4)
│   │   ├── resources/           # Ícones, listas de frequência
│   │   ├── electron.vite.config.ts
│   │   └── electron-builder.yml
│   └── extension/               # Extensão Chrome (WXT)
│       ├── entrypoints/
│       │   ├── netflix.content.ts
│       │   ├── youtube.content.ts
│       │   └── background.ts    # Mantém o WebSocket com o app
│       └── selectors.json       # Seletores das legendas, fáceis de atualizar
├── packages/
│   ├── core/                    # Domínio puro: pipeline de palavras, gerador de quiz, SM-2
│   ├── contracts/               # Schemas Zod: mensagens WS, canais IPC, respostas da IA
│   └── db/                      # Schema Drizzle + migrações
├── Makefile
├── commitlint.config.ts
├── lefthook.yml
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

**Direção das dependências:** `apps/*` dependem de `packages/*`, e `core` e `db` dependem só de `contracts`. Nenhum pacote importa de um app. O ESLint deve barrar importações fora dessa direção (regra `import/no-restricted-paths`).

## Módulos do app

Cada módulo tem uma responsabilidade só e conversa com os outros por interfaces. Assim dá para trocar a fonte de legenda ou o provedor de IA sem mexer no resto.

### Captura (`main/capture`)

- Interface comum: `CaptionSource { start(): void; stop(): void; on('caption', (c: CaptionEvent) => void) }`.
- `ExtensionSource`: servidor WebSocket em `127.0.0.1` (porta configurável, padrão 47615). Aceita só conexões com um token gerado na primeira execução e colado na extensão, para nenhum outro site da máquina enviar dados ao app.
- `AudioSource` (fase 4): inicia o helper em Swift como processo filho. Ele captura o áudio do sistema com ScreenCaptureKit, passa os trechos para o whisper.cpp e devolve as frases em JSON pelo stdout.
- Toda legenda vira um `CaptionEvent { text, startedAt, source, mediaTitle? }`, validado com Zod em `packages/contracts`.

### Extensão (`apps/extension`)

- Um content script por site observa o elemento das legendas com `MutationObserver` (Netflix: `.player-timedtext`; YouTube: `.ytp-caption-segment`). Os seletores ficam em `selectors.json`.
- Remove repetições (a mesma legenda continua na tela por vários frames) e manda cada frase nova ao background.
- O background mantém o WebSocket com o app, reconecta sozinho e guarda as frases em fila enquanto o app estiver fechado (no máximo 50).
- O destaque das palavras novas dentro da legenda chega do app pelo mesmo canal e é aplicado com `<span>` sobre o texto.

### Pipeline de palavras (`packages/core/pipeline`)

Funções puras, executadas em sequência para cada frase:

1. `normalize`: tira tags, notas de som (`[music]`) e nomes de personagem (`JOHN:`).
2. `tokenize` + `lemmatize` com wink-nlp: cada token vira `{ lemma, pos, surface }`.
3. `detectPhrases`: junta phrasal verbs e expressões a partir de uma lista em `resources/`.
4. `filter`: remove stopwords, nomes próprios, números, palavras abaixo do corte de frequência do nível da pessoa e tudo que está em `known_words`.
5. `score`: frequência na sessão × raridade geral. As palavras com maior pontuação vão para a fila da IA.

### IA (`main/ai`)

- `provider-factory.ts` cria o modelo do AI SDK conforme a configuração (Gemini, Claude ou DeepSeek). O resto do app só vê duas funções: `enrichWords(batch)` e `generateQuiz(words)`.
- As duas usam `generateObject` com um schema Zod, para que a resposta já chegue validada.
- `queue.ts` junta as palavras em lotes de até 5, ou a cada 8 segundos, o que vier antes. Limita a 10 chamadas por minuto e tenta de novo com espera crescente em caso de falha.
- Antes de chamar a API, consulta o cache (`word_senses`) por `lemma + pos`. Palavra já explicada não volta para a IA.
- Os prompts ficam em arquivos `.ts` versionados em `ai/prompts/`, com testes de snapshot.
- A API key fica no Keychain, pelo `safeStorage` do Electron, e nunca chega ao renderer.

### Quiz (`packages/core/quiz` + `main/services/quiz`)

- `selectWords`: escolhe até 10 palavras da sessão. Prioriza as mais frequentes e as que a pessoa errou antes. Com menos de 10, completa com palavras pendentes de revisão de sessões anteriores.
- A IA gera as questões num formato fechado: `{ type, prompt, options?, answer, explanation }`. Os tipos são `mc_en_pt`, `mc_pt_en`, `cloze`, `context_sense`, `match`, `true_false` e `type_word`.
- A correção é local. Na digitação, aceita diferenças de maiúsculas e um erro de letra (distância de Levenshtein ≤ 1).
- O resultado atualiza a revisão espaçada (SM-2) de cada palavra.

### Janelas (`main/windows`)

- **Overlay:** `transparent`, `frame: false`, `vibrancy: 'hud'`, `setAlwaysOnTop(true, 'screen-saver')`, `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`, `setIgnoreMouseEvents(true, { forward: true })` e `setContentProtection(true)`. O renderer avisa o main quando o mouse entra ou sai de um card, para ligar ou desligar os cliques.
- **Quiz, histórico e configurações:** janelas normais, criadas só quando abertas.
- Todas com `contextIsolation: true`, `sandbox: true` e `nodeIntegration: false`.

### Contratos IPC (`packages/contracts/ipc.ts`)

Os canais são definidos num único objeto tipado. O preload expõe só esses canais, e o main valida cada payload com Zod antes de usar.

| Canal | Direção | Payload |
| --- | --- | --- |
| `session:start` / `session:stop` | renderer → main | `{ source }` / — |
| `session:status` | main → renderer | `{ state, elapsedMs, newWords, source }` |
| `vocab:card` | main → overlay | `WordCard` (palavra, tradução, explicação, frase, nível, contagem) |
| `vocab:mark-known` / `vocab:save` | renderer → main | `{ lemma }` |
| `overlay:set-interactive` | overlay → main | `{ interactive: boolean }` |
| `quiz:get` / `quiz:answer` / `quiz:finish` | quiz → main | `{ sessionId }` / `{ questionId, answer }` / `{ quizId }` |
| `history:list` / `history:words` | history → main | filtros e paginação |
| `settings:get` / `settings:set` | settings → main | `Settings` (sem a API key em texto) |

## Banco de dados

Um único arquivo SQLite em `~/Library/Application Support/Legendary/legendary.db`, acessado só pelo processo main. O schema fica em `packages/db/schema.ts` (Drizzle), e as migrações são geradas com `drizzle-kit generate` e aplicadas na abertura do app com o `migrate()` do Drizzle.

| Tabela | Colunas principais | Observação |
| --- | --- | --- |
| `word_senses` | `id`, `lemma`, `pos`, `translation`, `explanation`, `example_en`, `example_pt`, `cefr`, `provider`, `created_at` | Cache global de sentidos. Índice único em `(lemma, pos, translation)` |
| `sessions` | `id`, `title`, `source`, `started_at`, `ended_at` | `source`: `netflix`, `youtube` ou `audio` |
| `session_words` | `session_id`, `sense_id`, `count`, `context_sentence`, `first_seen_at` | Chave primária `(session_id, sense_id)` |
| `known_words` | `lemma`, `marked_at` | Palavras marcadas como "Já sei" |
| `saved_words` | `sense_id`, `saved_at` | Palavras salvas pela pessoa |
| `quizzes` | `id`, `session_id`, `created_at`, `finished_at`, `score` |  |
| `quiz_questions` | `id`, `quiz_id`, `sense_id`, `type`, `payload_json`, `user_answer`, `correct` | `payload_json` validado com Zod ao ler |
| `reviews` | `sense_id`, `ease`, `interval_days`, `repetitions`, `due_at` | Estado da revisão espaçada (SM-2) |
| `settings` | `key`, `value_json` | Preferências. A API key não fica aqui |

**Configuração na abertura:** `journal_mode = WAL`, `foreign_keys = ON` e `synchronous = NORMAL`.

**Acesso:** cada tabela tem um repositório em `main/db/repositories/`. Os serviços usam os repositórios, nunca o Drizzle direto, para que os testes possam rodar com um banco em memória (`:memory:`).

**Módulo nativo:** o better-sqlite3 precisa ser compilado para a versão do Electron. O `postinstall` roda `electron-builder install-app-deps`, e o `make rebuild` faz isso manualmente.

## Qualidade, CI e empacotamento

Todo PR precisa passar por lint, checagem de tipos e testes antes do merge. O build do `.dmg` só roda nas tags de versão.

| Área | Ferramenta | O que cobre |
| --- | --- | --- |
| Testes de unidade | Vitest | `packages/core` (pipeline, quiz, SM-2) com meta de cobertura de 80% |
| Testes de integração | Vitest + SQLite `:memory:` | Repositórios, serviços e fila da IA, com o provedor substituído por um mock |
| Prompts | Vitest (snapshot) | Mudanças nos prompts aparecem no diff do PR |
| Ponta a ponta | Playwright (`_electron`) | Abrir o app, simular legendas pelo WebSocket, ver o card e fazer um quiz |
| Extensão | Vitest + jsdom | Content scripts contra HTML salvo das páginas da Netflix e do YouTube |
| Tipos | `tsc --noEmit` em todo o monorepo |  |
| Lint e formatação | ESLint + Prettier | Rodam no `pre-commit` (lefthook) só nos arquivos alterados |

**CI (GitHub Actions, runner `macos-latest`):**

1. `pull_request`: `make ci`, que roda lint, typecheck e testes.
2. `push` de tag `v*`: `make release`, que gera o `.dmg` assinado e notarizado e o `.zip` da extensão, e anexa os dois a um GitHub Release.

**Empacotamento:** electron-builder gera `.dmg` para Apple Silicon e Intel (`arm64` e `x64`). Assinatura e notarização usam as variáveis `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` e `APPLE_TEAM_ID` nos segredos do CI. O helper em Swift entra como recurso extra (`extraResources`) e é assinado junto.

**Versão:** segue SemVer, e o changelog é gerado a partir dos commits (próxima seção) com `changelogen`.

## Padrão de commits

Todos os commits seguem o [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/), validados pelo commitlint no hook `commit-msg`. Nenhum commit pode ter linha de coautoria (`Co-authored-by:`), nem de pessoas nem de ferramentas de IA como o Claude. O autor do commit é sempre quem faz o commit.

**Formato:**

```
<tipo>(<escopo opcional>): <descrição no imperativo, minúscula, sem ponto final>

<corpo opcional: o porquê da mudança>

<rodapé opcional: BREAKING CHANGE: ... ou Refs: #123>
```

| Tipo | Quando usar | Exemplo |
| --- | --- | --- |
| `feat` | Nova funcionalidade | `feat(overlay): add fade-out to old cards` |
| `fix` | Correção de bug | `fix(extension): handle netflix caption reflow` |
| `docs` | Só documentação | `docs: describe ipc channels in readme` |
| `style` | Formatação, sem mudar comportamento | `style: apply prettier to renderer` |
| `refactor` | Mudança de código sem corrigir bug nem adicionar funcionalidade | `refactor(core): split filter step` |
| `perf` | Melhoria de desempenho | `perf(pipeline): cache lemmatizer results` |
| `test` | Testes novos ou ajustados | `test(quiz): cover cloze grading` |
| `build` | Build, dependências, Makefile | `build: bump electron to 44` |
| `ci` | Pipelines de CI | `ci: add notarization step` |
| `chore` | Manutenção que não entra no app | `chore: update gitignore` |
| `revert` | Desfaz um commit anterior | `revert: feat(overlay): add fade-out` |

**Escopos permitidos:** `overlay`, `quiz`, `history`, `settings`, `capture`, `extension`, `pipeline`, `ai`, `db`, `core`, `contracts`, `native`, `deps`.

**Regras do commitlint** (`commitlint.config.ts`):

- base `@commitlint/config-conventional`;
- `type-enum` com os 11 tipos da tabela e `scope-enum` com os escopos acima;
- `header-max-length` de 72 caracteres;
- uma regra customizada `no-co-authored-by`, que rejeita qualquer mensagem contendo `Co-authored-by:` (sem diferenciar maiúsculas).

Commits gerados com ajuda de IA seguem a mesma regra: a pessoa revisa, faz o commit em seu nome e remove qualquer linha de coautoria antes.

## Makefile

O Makefile na raiz é o ponto de entrada para tudo: quem chega ao projeto roda `make setup` e depois `make dev`. Cada alvo chama scripts do pnpm, para que o CI e a máquina local façam exatamente a mesma coisa.

```makefile
.DEFAULT_GOAL := help
SHELL := /bin/bash
PNPM  := pnpm

.PHONY: help setup dev dev-ext build build-app build-ext build-native \
        rebuild lint format typecheck test test-e2e ci \
        db-generate db-migrate db-studio package release clean

help: ## Lista os alvos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

setup: ## Instala dependências, hooks e compila módulos nativos
	corepack enable
	$(PNPM) install
	$(PNPM) lefthook install
	$(MAKE) rebuild

dev: ## Roda o app Electron com hot reload
	$(PNPM) --filter desktop dev

dev-ext: ## Roda a extensão em modo dev (abre o Chrome com ela carregada)
	$(PNPM) --filter extension dev

build: build-app build-ext ## Build de produção do app e da extensão

build-app:
	$(PNPM) --filter desktop build

build-ext:
	$(PNPM) --filter extension build

build-native: ## Compila o helper de áudio em Swift (fase 4)
	swift build -c release --package-path apps/desktop/native/audio-helper

rebuild: ## Recompila better-sqlite3 para a versão do Electron
	$(PNPM) --filter desktop exec electron-builder install-app-deps

lint: ## ESLint em todo o monorepo
	$(PNPM) -r lint

format: ## Prettier em todo o monorepo
	$(PNPM) prettier --write .

typecheck: ## Checagem de tipos
	$(PNPM) -r typecheck

test: ## Testes de unidade e integração
	$(PNPM) -r test

test-e2e: build-app ## Testes ponta a ponta com Playwright
	$(PNPM) --filter desktop test:e2e

ci: lint typecheck test ## O que o CI roda em cada PR

db-generate: ## Gera migração a partir do schema Drizzle
	$(PNPM) --filter db drizzle-kit generate

db-migrate: ## Aplica migrações no banco de desenvolvimento
	$(PNPM) --filter db drizzle-kit migrate

db-studio: ## Abre o Drizzle Studio para inspecionar o banco
	$(PNPM) --filter db drizzle-kit studio

package: build build-native ## Gera o .dmg local, sem assinatura
	$(PNPM) --filter desktop exec electron-builder --mac --publish never \
	  -c.mac.identity=null

release: ci build build-native ## .dmg assinado e notarizado + zip da extensão
	$(PNPM) --filter desktop exec electron-builder --mac --publish never
	$(PNPM) --filter extension zip

clean: ## Remove builds e caches
	rm -rf apps/*/out apps/*/dist apps/extension/.output node_modules/.cache
```

No dia a dia, os alvos mais usados são `make dev`, `make dev-ext`, `make test` e `make ci` antes de abrir um PR.

## Fontes

As versões foram conferidas em resultados de busca em novembro de 2026. Confirme no npm ao criar o projeto.

- [Electron: política de versões](https://www.electronjs.org/es/docs/latest/tutorial/electron-timelines)
- [Projeto atualizado para Electron 43, electron-vite 5 e Vite 7 (jul/2026)](https://github.com/ParkviewLab/conception-space/releases/tag/v0.8.5)
- [electron-vite 5.0 e Vite 8 (changelog via Dependabot)](https://github.com/microsoft/dynwinrt/pull/8)
- [AI SDK da Vercel: versões publicadas](https://releasealert.dev/npmjs/_/ai?page=20)
- [better-sqlite3: releases](https://backiee.wasmer.app/http_github_com/WiseLibs/better-sqlite3/releases)
- [Drizzle ORM: versão 0.45](https://central.sonatype.com/artifact/org.mvnpm/drizzle-orm/)
- [Drizzle com SQLite: guia oficial](https://orm.drizzle.team/docs/quick-sqlite)
- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/pt-br/v1.0.0/)
