# Legendary: imersão sem pausa

Assistir com áudio e legenda em inglês é uma das recomendações mais comuns de professores para quem
quer ganhar fluência. O problema é a palavra que você não conhece: parar o vídeo para pesquisar quebra a
imersão, e deixar passar faz você perder justamente o vocabulário novo.

O Legendary tira essa pausa do caminho. Ele lê a legenda da Netflix ou do YouTube enquanto você assiste
e, quando aparece uma palavra do seu nível, a tradução surge no canto da tela, já no sentido da cena,
sem você tocar em nada. O vídeo segue, e no fim da sessão um quiz revisa as palavras que apareceram.

É um app para macOS com uma extensão para Brave ou Chrome. Tudo fica salvo no seu Mac, sem conta nem
servidor.

<p align="center">
  <img src="docs/screenshots/overlay.webp" width="100%" alt="Card com a palavra knack, traduzida como jeito, talento, com explicação e a frase da cena, ao lado de quatro palavras anteriores resumidas. Embaixo, a legenda com knack sublinhada e, em cima, a barra da sessão.">
</p>

> As capturas são do app real, com traduções de exemplo e uma cena ilustrativa no lugar do vídeo. O
> quiz, o histórico e o menu da barra vêm da página de preview, que monta os mesmos componentes com os
> dados do mockup.

## Como funciona

1. Você liga as legendas em inglês na Netflix ou no YouTube e inicia uma sessão com ⌘⇧L.
2. A extensão lê cada legenda que aparece e a envia ao app por um WebSocket local.
3. O app escolhe as palavras do seu nível, pede a tradução à IA e mostra um card no canto da tela. A
   palavra também ganha um sublinhado na própria legenda.
4. Ao encerrar com ⌘⇧E, você escolhe as palavras e faz um quiz de 10 questões. As que você errar
   voltam para revisão nos dias seguintes.

```mermaid
flowchart LR
  subgraph browser["Brave ou Chrome"]
    player["Netflix ou YouTube"] -->|legenda| ext["Extensão"]
  end
  ext -->|WebSocket local| main["App Electron"]
  main -.->|sublinhado e voltar 10 s| ext
  main --> nlp["Pipeline local:<br/>wink-nlp e lista de frequência"]
  nlp --> queue["Fila de tradução"]
  queue -->|palavra e frase| ai[("Gemini, Claude<br/>ou DeepSeek")]
  main <--> db[("SQLite")]
  main -->|IPC| ui["Overlay, quiz e histórico"]
```

Cada legenda passa por limpeza, tokenização e lematização, detecção de phrasal verbs e expressões, e
um filtro pelo seu nível baseado numa lista de frequência. Tudo isso roda no Mac. Só as palavras
escolhidas vão para a IA, junto com a frase em que apareceram, para que a tradução siga o sentido da
cena. Uma palavra traduzida fica salva e não volta para a IA.

## Recursos

### Cards sobre o vídeo

- O card novo mostra a tradução, uma explicação curta em português e a frase da cena. Os anteriores
  encolhem para um resumo, e passar o mouse abre o card de novo, com outro exemplo.
- A tradução chega em streaming, antes da explicação, e as próximas palavras são traduzidas enquanto
  você lê o card atual.
- Funciona com o vídeo em tela cheia, e a pilha pode ser arrastada para qualquer ponto da tela. Cada
  monitor guarda a própria posição.
- Botões para salvar a palavra ou marcá-la como conhecida, para que não apareça mais.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/youtube.webp" alt="Cena clara do YouTube com o card de head out e a barra da sessão quase transparente."></td>
    <td width="50%"><img src="docs/screenshots/states.png" alt="Estados da barra da sessão e dos cards: ativa, pausada, sem legenda, erro da IA, card carregando e card aberto pelo mouse."></td>
  </tr>
  <tr>
    <td>Numa cena clara. A barra da sessão some quase toda enquanto o mouse está longe do topo.</td>
    <td>Os estados da barra e dos cards: pausa, falta de legenda, erro da IA, tradução a caminho e o card aberto pelo mouse.</td>
  </tr>
</table>

### Busca com ⌘⇧B

Ouviu uma palavra que não virou card? ⌘⇧B abre uma barra por cima do vídeo, mesmo em tela cheia, sem
tirar o navegador da frente. A palavra entra como um card normal, com a frase da legenda em que
apareceu, e vai para o histórico e para o quiz. Uma opção volta o vídeo 10 segundos para você ouvir de
novo.

<p align="center">
  <img src="docs/screenshots/search.webp" width="100%" alt="Barra de busca com out of the blue digitado, no alto da cena, com a pilha de cards à direita.">
</p>

### Todas as palavras e mais de um card por vez

O nível escolhe as palavras pela frequência, e às vezes deixa passar uma que você não sabia. O modo
"Todas as palavras" ignora o nível. Uma palavra que volta aparece só em resumo, com o contador `2x`,
`3x`, sem chamar a IA de novo, e passar o mouse mostra o resto.

Nas Configurações você também escolhe quanto tempo cada card fica aberto, de 3 a 30 segundos, quantos
ficam abertos ao mesmo tempo, até 3, quantos cards por minuto e quantos resumos ficam na tela.

<table>
  <tr>
    <td width="40%"><img src="docs/screenshots/all-words.png" alt="Dois cards abertos, calm e furious, e abaixo resumos com contador: shop 2x e coffee 3x."></td>
    <td width="60%"><img src="docs/screenshots/settings.png" alt="Configurações: provedor de IA, chave, nível, todas as palavras, cards por minuto, tempo de cada card, cards por vez, resumos, posição, destaque na legenda, voltar o vídeo ao buscar e extensão."></td>
  </tr>
</table>

### Quiz e revisão

Ao encerrar a sessão, você vê o que aprendeu, escolhe as palavras e faz o quiz. São 7 tipos de
questão: múltipla escolha nos dois sentidos, completar a frase, sentido no contexto, associar, verdadeiro
ou falso e digitar a palavra. As teclas 1 a 4 respondem e Enter avança. As palavras entram numa revisão
espaçada com SM-2, e o quiz é montado localmente se faltar a chave ou a internet.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/quiz-summary.png" alt="Resumo da sessão com a duração, as palavras novas e a lista de palavras para o quiz."></td>
    <td width="50%"><img src="docs/screenshots/quiz-question.png" alt="Questão de completar a frase, a terceira de dez."></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/quiz-match.png" alt="Questão de associar palavras e traduções, com uma palavra sendo arrastada."></td>
    <td width="50%"><img src="docs/screenshots/quiz-result.png" alt="Resultado do quiz com a nota e as palavras para revisar."></td>
  </tr>
</table>

### Histórico

Todas as sessões e palavras, com quantas vezes cada uma apareceu, os acertos, o nível e a próxima
revisão. Dá para buscar, filtrar e refazer o quiz de uma sessão.

<p align="center">
  <img src="docs/screenshots/history.png" width="100%" alt="Histórico com as sessões à esquerda e a tabela de palavras da sessão Northbound T1E3.">
</p>

### Barra de menus e extensão

<table>
  <tr>
    <td width="62%"><img src="docs/screenshots/menu.png" alt="Menu da barra do macOS com a sessão ativa e as opções de pausar, encerrar, esconder os cards, histórico e configurações."></td>
    <td width="38%"><img src="docs/screenshots/extension.png" alt="Popup da extensão conectada ao app, com o código de pareamento e a porta."></td>
  </tr>
  <tr>
    <td>O menu da barra controla a sessão e abre o histórico e as Configurações.</td>
    <td>O popup da extensão, onde você cola o código que conecta o navegador ao app.</td>
  </tr>
</table>

## Atalhos

| Atalho | O que faz |
| --- | --- |
| ⌘⇧L | Inicia a sessão, ou pausa e retoma |
| ⌘⇧E | Encerra a sessão e abre o quiz |
| ⌘⇧B | Abre a busca de palavra. Também funciona com o foco no player |
| ⌘⇧K | Marca a palavra do card atual como conhecida |
| ⌘⇧H | Esconde ou mostra os cards |

## Tecnologias

| Camada | Tecnologia |
| --- | --- |
| Linguagem | TypeScript 6 em modo `strict`, num monorepo com pnpm 12 |
| Desktop | Electron 45 e electron-vite 6 |
| Interface | React 19, Tailwind CSS 4, Motion 14 e Zustand 5 |
| Banco | SQLite com better-sqlite3 13 e Drizzle ORM 0.45 |
| IA | AI SDK 7 com Gemini (`gemini-2.5-flash`), Claude (Haiku 5.5 traduz e Opus 5.5 monta o quiz) e DeepSeek (`deepseek-v4-flash`) |
| Linguagem natural | wink-nlp 2, local: tokenização, lematização e classes gramaticais |
| Contratos | Zod 4 nas mensagens IPC, no WebSocket e nas respostas da IA |
| Extensão | WXT 0.21, Manifest V3 |
| Comunicação | WebSocket local com `ws` 8 |
| Testes | Vitest 5 e Playwright 1.65 no app Electron, na extensão e na comparação com o mockup |
| Qualidade | ESLint 10, Prettier 3, Lefthook e commitlint |
| Empacotamento | electron-builder 26 |

## Estrutura

```
apps/
  desktop/     App Electron: processo main (serviços, IA, banco e janelas), preload e telas
  extension/   Extensão: lê as legendas, sublinha a palavra e volta o vídeo
packages/
  contracts/   Schemas e tipos compartilhados: IPC, WebSocket, IA e domínio
  core/        Lógica pura: pipeline das legendas, quiz e revisão espaçada
  db/          Schema do banco e migrações
design/        Cópia do mockup e os frames de referência dos testes visuais
docs/          Capturas de tela
```

## Privacidade e segurança

- Sessões, palavras e quizzes ficam num SQLite em `~/Library/Application Support/Legendary`. Não há
  conta nem servidor do Legendary.
- Para a IA vão só as palavras escolhidas e a frase em que apareceram, direto para o provedor que você
  escolheu, com a sua chave.
- A chave da API é cifrada com o `safeStorage` do Electron, que guarda a chave de cifragem no Keychain.
  Ela nunca sai do processo main: as janelas só recebem uma versão mascarada.
- O WebSocket só escuta em `127.0.0.1`, exige o código de pareamento e recusa conexões vindas de sites.
- As janelas rodam com sandbox e isolamento de contexto, sem acesso ao Node e com CSP restrita. Cada
  mensagem IPC é validada.

## Como rodar

Requisitos: macOS 13 ou mais novo, Homebrew, Xcode Command Line Tools, Brave ou Chrome, e uma chave de
API do Gemini, do Claude ou do DeepSeek.

```bash
brew install node@22 pnpm
make setup
make dev
```

O `Makefile` usa o Node 22 do Homebrew mesmo que ele não seja o padrão da máquina. Na primeira
execução, o app pede a chave da API e o seu nível de inglês.

Para instalar a extensão:

1. Rode `make build-ext`, que gera a pasta `apps/extension/.output/chrome-mv3`.
2. Em `brave://extensions` ou `chrome://extensions`, ligue o modo do desenvolvedor, clique em "Carregar
   sem compactação" e escolha essa pasta. Como `.output` começa com ponto, aperte ⌘⇧. no seletor para
   ver as pastas ocultas.
3. Copie o código em Configurações → Extensão e cole no popup da extensão.

Depois de atualizar o código da extensão, recarregue-a na página de extensões.

## Comandos

| Comando | O que faz |
| --- | --- |
| `make dev` | Roda o app com hot reload |
| `make build-ext` | Gera a extensão em `apps/extension/.output/chrome-mv3` |
| `make ci` | Lint, tipos e testes de unidade e integração |
| `make test-e2e` | Testes ponta a ponta no app real, inclusive com a extensão em um Chromium |
| `make test-visual` | Compara cada tela com o frame do mockup, em `design/reference` |
| `make package` | Gera o `.dmg` local, sem assinatura |
| `make help` | Lista todos os alvos |

Os testes ponta a ponta abrem janelas de verdade e registram os atalhos globais enquanto rodam, então é
melhor não usar o computador ao mesmo tempo.

## UI

A referência visual é o mockup do Claude Design, com cópia local em `design/`. Toda mudança de UI
precisa ser conferida contra ele. As telas são componentes sem acesso ao IPC, e a página
`src/renderer/preview` os monta com os dados do mockup para o `make test-visual` comparar.

## Dados de terceiros

A lista de frequência deriva do projeto FrequencyWords, sob CC BY-SA 4.0. Veja
`apps/desktop/resources/NOTICE.md`.
