# Legendary Implementation Plan

**Goal:** construir o app descrito na especificação técnica, com a UI fiel ao mockup do Claude Design.

**Architecture:** monorepo pnpm com `apps/desktop` (Electron), `apps/extension` (WXT) e `packages/{contracts,core,db}`. Só o processo main acessa banco, rede e API key.

**Spec:** `Legendary — especificação técnica de implementação.md`. Referência visual: `design/`.

## Decisões aprovadas (2026-11-06)

- Overlay em uma janela transparente, sem blur real. O vidro fica isolado no componente `Glass`.
- Sem o helper de áudio nesta rodada. "Áudio do sistema" aparece desabilitado no menu.
- Telas sem frame derivam dos tokens do mockup: primeira execução, popup da extensão, campo do token nas Configurações e os tipos de questão sem desenho.
- Só modo escuro, porque o mockup não tem referência de modo claro.
- Commits por etapa na branch `feat/initial-app`, sem `Co-authored-by` e sem push.

## Etapas

Cada etapa termina com lint, tipos e testes passando, e um commit. Lógica de domínio é escrita com teste primeiro.

1. **Base:** workspace, TypeScript, ESLint, Prettier, commitlint, lefthook, Makefile, CI, cópia do mockup.
2. **`packages/contracts`:** schemas Zod de WebSocket, IPC, IA e domínio.
3. **`packages/core`:** pipeline, seleção e correção de quiz, SM-2.
4. **`packages/db`:** schema Drizzle e migrações.
5. **Main:** repositórios, serviços, fila de IA, WebSocket, janelas, tray, atalhos, IPC.
6. **Renderers:** overlay, menu, configurações, quiz, histórico, cada um comparado ao frame do mockup.
7. **Extensão:** content scripts, background, popup.
8. **Fechamento:** E2E com Playwright, comparação visual, `.dmg` local sem assinatura.
