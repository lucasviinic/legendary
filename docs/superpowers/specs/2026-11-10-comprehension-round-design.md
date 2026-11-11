# Rodada de compreensão

O quiz de hoje testa palavras isoladas. A rodada de compreensão testa se a pessoa entendeu o que
assistiu como um todo: a história, as motivações e a mensagem. Ela vem depois do quiz de palavras e
usa a transcrição da sessão.

## Decisões aprovadas (2026-11-10)

- **Rodada separada, depois do quiz de palavras.** A rodada tem nota própria e não entra na revisão
  espaçada, que é por palavra.
- **Perguntas de múltipla escolha.** O resumo escrito é opcional: a tela de resultado da rodada
  oferece "Escrever um resumo".
- **Conteúdo em inglês:** perguntas, alternativas, explicações, o resumo e o retorno sobre ele. Os
  botões e rótulos do app continuam em português.
- **O resumo escrito tem duas avaliações separadas.** A nota é sobre a compreensão. Até 3 correções
  do inglês aparecem à parte e não baixam a nota.
- **A geração começa quando a pessoa clica "Começar quiz".** As perguntas ficam prontas enquanto ela
  faz o quiz de palavras. Quem sai com "Agora não" não gasta chamada à IA. Pelo histórico, a geração
  começa ao pedir a rodada.

## 1. Transcrição da sessão

- **Tabela nova `session_lines`:** `session_id` (com `on delete cascade`), `at` (horário do app,
  como `first_seen_at`) e `text`. Cada legenda que a sessão ativa processa vira uma linha.
- **Nome de quem fala:** o texto fica como chegou, com o nome quando a Netflix mostra ("JOHN: …"),
  porque isso ajuda a entender a cena.
- **Junção das legendas:** uma função pura em `packages/core` decide o que guardar.
  - Na legenda automática do YouTube, que rola em duas linhas, a legenda nova repete a última linha
    da anterior. Quando a legenda nova começa com o fim da anterior, com 3 palavras ou mais em comum,
    só a parte nova é guardada.
  - Se a mesma legenda reaparece logo em seguida, ela é ignorada.
- **Mínimo para oferecer a rodada:** 150 palavras de transcrição. Abaixo disso, nem o cartão nem o
  botão do histórico aparecem.
- **Sessões longas:** até cerca de 30 mil palavras, a transcrição vai inteira para a IA. Acima disso,
  vão trechos espaçados ao longo da sessão, sempre com linhas inteiras. Essa escolha também é uma
  função pura em `packages/core`.
- **Privacidade:** a transcrição fica no SQLite local. Ela só sai do computador para o provedor de IA
  escolhido, o mesmo que já recebe as frases das palavras.

## 2. Geração e armazenamento

- **Serviço novo `ComprehensionService`** no main. Ele guarda em memória a geração em andamento de
  cada sessão, para não gerar duas vezes.
  - `quiz:get` dispara a geração em segundo plano, sem esperar o resultado. Isso só acontece se a
    sessão tiver transcrição suficiente, houver provedor de IA e não houver rodada pronta e ainda não
    feita.
  - Pelo histórico, o pedido da rodada espera a geração.
- **Método novo no provedor:** `generateComprehension({ title, transcript })`, com o mesmo modelo e o
  mesmo limite de 120 s do quiz. O schema Zod da resposta tem:
  - `questions`: de 3 a 5 itens. Cada um tem `prompt`, `options` (4), `answer`, `explanation` e
    `quote`, a linha da legenda que comprova a resposta.
  - `keyPoints`: de 3 a 6 frases com os pontos principais do conteúdo.
- **Prompt:**
  - Tudo em inglês.
  - As perguntas são sobre enredo, motivações, causa e efeito e a mensagem principal, nunca sobre
    vocabulário.
  - Elas cobrem a sessão inteira, e cada uma pode ser respondida pela transcrição.
  - As alternativas erradas são plausíveis.
  - A transcrição é dado, não instrução.
- **Validação:**
  - O app descarta pergunta sem 4 alternativas ou cuja resposta não esteja entre elas.
  - As alternativas são embaralhadas.
  - O horário de cada citação vem da linha da transcrição que a contém. Uma citação que não aparece
    na transcrição fica sem horário.
  - Com menos de 3 perguntas válidas, a geração conta como falha.
- **Banco:**
  - `comprehension_rounds`: `session_id` (com `on delete cascade`), `created_at`, `payload_json`
    (perguntas e pontos principais), `finished_at`, `score`, `summary_text` e
    `summary_feedback_json`.
  - `comprehension_answers`: `round_id` (com `on delete cascade`), `question_index`, `user_answer` e
    `correct`.
- **Correção do resumo:** um segundo método no provedor,
  `gradeSummary({ title, keyPoints, summary })`. Ele recebe os pontos principais, não a transcrição
  inteira. Devolve:
  - `verdict`: `understood`, `partly` ou `missed`;
  - `missing`: o que faltou, em inglês;
  - `corrections`: até 3 itens com `original` e `corrected`.
- **Sem IA:** não há rodada, porque essas perguntas não têm versão local.

## 3. Telas e fluxo

A rodada usa a janela do quiz (760×580). As teclas seguem o quiz de palavras:

- 1 a 4 respondem;
- Enter avança;
- ⌘↵ envia o resumo;
- Esc fecha a janela em qualquer etapa.

Cada tela é desenhada no mockup antes de ser implementada.

- **Frame 1i (atualizado), tela final do quiz:** abaixo da nota e dos erros entra o cartão
  "Compreensão do episódio". Ele tem três estados:
  - "Preparando as perguntas…" enquanto a IA gera;
  - "N perguntas sobre o que você assistiu", com o botão "Testar compreensão";
  - "Não deu para preparar", com "Tentar de novo".
  Sem transcrição suficiente ou sem provedor de IA, o cartão não aparece.
- **Frame 2f, pergunta:** segue o frame 1g. Tem o progresso "1 de N", o rótulo "Compreensão", a
  pergunta e 4 alternativas. Depois da resposta, o painel mostra a explicação e a citação com o
  horário da sessão, por exemplo: "JOHN: I reckon we should head out…" · 12:04.
- **Frame 2g, resultado da rodada:** a nota (3/4) e as perguntas erradas, cada uma com a resposta
  certa e a citação. Os botões são "Fechar" e "Escrever um resumo", e este é o principal.
- **Frame 2h, resumo escrito:**
  - o pedido "Summarize what you watched in 2–3 sentences.";
  - um campo de texto;
  - a dica "A nota é sobre o que você entendeu, não sobre o inglês".
  Os botões são "Pular" e "Enviar ⌘↵". "Enviar" fica desabilitado com menos de 5 palavras e mostra
  "Corrigindo…" durante a correção.
- **Frame 2i, retorno do resumo:**
  - a nota: Entendeu, Entendeu em parte ou Não entendeu;
  - o que faltou;
  - até 3 correções do inglês, cada uma com o trecho original riscado e a forma certa.
  O botão é "Fechar".
- **Frame 1j (atualizado), histórico:** "Testar compreensão" ao lado de "Refazer quiz", quando a
  sessão tem transcrição suficiente. O botão abre a janela do quiz direto na rodada, com
  "Preparando as perguntas…" enquanto espera. Uma rodada pronta e ainda não feita é reaproveitada.
  Depois de feita, uma nova geração traz perguntas novas.

### Contratos

- **`HistorySessionSchema`** ganha `comprehension: boolean`, que diz se a sessão tem transcrição
  suficiente.
- **Canais IPC novos:**
  - `comprehension:status`, com `{ sessionId }`: devolve `unavailable`, `preparing`, `ready` (com o
    número de perguntas) ou `failed`.
  - `comprehension:get`, com `{ sessionId }`: espera a geração e devolve a rodada sem as respostas.
  - `comprehension:retry`, com `{ sessionId }`: dispara a geração de novo depois de uma falha.
  - `comprehension:answer`, com `{ roundId, index, answer }`: devolve se acertou, a resposta certa,
    a explicação e a citação.
  - `comprehension:finish`, com `{ roundId }`: devolve a nota e as perguntas erradas.
  - `comprehension:grade-summary`, com `{ roundId, summary }`: devolve a nota do resumo, o que
    faltou e as correções.
  - `comprehension:open`, com `{ sessionId }`: abre a janela do quiz na rodada, pelo histórico.
- **Evento `comprehension:changed`, com `{ sessionId, status }`:** atualiza o cartão da tela final
  sem consulta repetida.

## 4. Erros e casos de borda

- **Sessões anteriores a esta mudança:** não têm transcrição, então não oferecem a rodada.
- **Janela fechada durante a geração:** a geração continua no main e a rodada fica salva. Se o app
  fechar no meio, nada é salvo, e o histórico gera de novo quando a pessoa pedir.
- **Geração com falha ou tempo esgotado:** o cartão mostra "Não deu para preparar" com "Tentar de
  novo".
- **Correção do resumo com falha:** a tela mostra "Não deu para corrigir agora" com "Tentar de novo",
  e o texto continua no campo.
- **Sessão sem palavras novas:** ela não abre o quiz ao encerrar, e a rodada dela fica só pelo
  histórico.
- **Troca de provedor:** vale o provedor escolhido na hora de cada chamada.

## 5. Testes

Tudo com teste primeiro.

- **`packages/core`:**
  - a junção das legendas, com exemplos da legenda automática do YouTube, da Netflix e de
    repetições;
  - a escolha dos trechos espaçados para sessões longas;
  - o mínimo de 150 palavras.
- **`packages/contracts`:** os schemas da resposta da IA, da rodada e dos canais novos.
- **Main, com o harness e o provedor falso:**
  - a sessão grava a transcrição já com as legendas juntadas;
  - `quiz:get` dispara uma geração só;
  - o serviço descarta perguntas inválidas e trata menos de 3 como falha;
  - as respostas são corrigidas localmente e a nota é guardada;
  - a correção do resumo recebe os pontos principais;
  - nas falhas, o status vira `failed` e "Tentar de novo" funciona;
  - apagar a sessão apaga a transcrição e as rodadas.
- **Prompts:** snapshots dos dois prompts novos, incluindo a regra de tratar a legenda como dado.
- **`provider-factory`:** o formato das duas chamadas novas, como já é testado para o quiz.
- **e2e:** o provedor falso também gera compreensão e corrige o resumo. O teste segue uma sessão com
  legendas:
  1. quiz de palavras;
  2. cartão pronto;
  3. rodada;
  4. resultado;
  5. resumo;
  6. retorno.
  Depois abre a rodada pelo histórico.
- **Visual:** os frames 1i e 1j atualizados e os frames novos 2f a 2i, comparados com o mockup.

## Fora do escopo

- Mostrar no histórico o resultado das rodadas anteriores.
- Rodada de compreensão sem IA.
- Perguntas de compreensão misturadas ao quiz de palavras.
