# Letras do Spotify

Hoje o Legendary só lê legendas do navegador, pela extensão. Esta origem nova lê as letras das
músicas que tocam no app do Spotify para Mac, sem navegador e sem extensão. Cada verso cantado vira
uma legenda, e o resto do app (cards, IA, histórico e quiz) funciona como já funciona.

## Decisões aprovadas (2026-11-23)

- **Origem nova "Spotify"** no menu, ao lado de "Navegador" e "Áudio do sistema". Uma sessão lê só
  uma origem, sem misturar música e vídeo.
- **Uma sessão por música.** Cada faixa vira uma linha no histórico, com o título
  "Música · Artista".
- **Encerrar abre o quiz da última música que gerou palavras.** As outras ficam no histórico, cada
  uma com o próprio quiz.
- **O Spotify é lido por AppleScript a cada segundo** a partir do main, e a posição entre as leituras
  é estimada pelo relógio. Não há código nativo.
- **As letras sincronizadas vêm do LRCLIB** (`lrclib.net`), aberto e gratuito. O serviço interno de
  letras do Spotify não é usado, porque não é oficial e fere os termos do Spotify.
- **Fora do escopo:** voltar 10 s ao buscar, seguir a janela do Spotify com os cards, música tocando
  em outro aparelho pelo Spotify Connect, letras sem tempo e o app Música da Apple.

## Viabilidade comprovada

Um script descartável rodou em 23/11/2026 com o Spotify do usuário tocando "Man I Need" (Olivia
Dean):

- O AppleScript devolveu nome, artista, álbum, duração (em ms), posição (em s), estado e id da faixa.
- A posição andou junto com o relógio, com diferença de 0,01 s em leituras a cada 1,8 s.
- `GET /api/get` do LRCLIB, com nome, artista, álbum e duração, devolveu 62 versos com tempo. A
  duração do LRCLIB (184 s) e a do Spotify (182 s) ficaram dentro da tolerância de ±2 s do serviço.
- Os versos saíram no tempo certo ao comparar a posição estimada com o tempo de cada verso.

## 1. Leitura do Spotify

- **Interface `SpotifyPlayer`** no main, com um método `read()` que devolve um destes estados:
  - `{ kind: 'closed' }`: o Spotify não está aberto.
  - `{ kind: 'denied' }`: o macOS recusou o controle do Spotify (erro `-1743` do AppleScript).
  - `{ kind: 'stopped' }`: aberto, mas parado ou sem faixa.
  - `{ kind: 'track', id, name, artist, album, durationMs, positionS, playing }`.
- **Implementação `AppleScriptPlayer`:** roda o `osascript` como processo filho.
  - Primeiro confere `application "Spotify" is running`. Um `tell application "Spotify"` com o app
    fechado abriria o Spotify, então ele só é usado quando o app já está aberto.
  - Uma chamada só devolve todos os campos, separados por tabulação, como no teste de viabilidade.
  - A posição usa `as text`, e a vírgula decimal de um macOS em português vira ponto antes da
    conversão.
  - Nome ou artista vazios contam como `stopped`.
- **No modo de teste** (`LEGENDARY_E2E=1`), o main usa um `FakeSpotifyPlayer` que o teste controla
  por `app.emit('legendary:spotify', estado)`, como já faz com `legendary:toggle-search`.

## 2. Letras

- **Cliente `LyricsClient`** no main, com `find({ name, artist, album, durationS })`:
  1. `GET https://lrclib.net/api/get` com `track_name`, `artist_name`, `album_name` e `duration`.
  2. Se não vier `syncedLyrics`, tenta `GET /api/search` com `track_name` e `artist_name` e fica com
     o resultado que tem `syncedLyrics` e a duração mais próxima, desde que a diferença seja de até
     5 s.
  3. Sem resultado, devolve `null`.
- **Cabeçalho `User-Agent`:** `Legendary/<versão do app>`, sem dado pessoal.
- **Limite de 10 s** por requisição. Erro de rede conta como "sem letra" para aquela faixa e tenta
  de novo da próxima vez que ela tocar.
- **Cache em memória por id da faixa,** durante o uso do app, inclusive para `null`.
- **No modo de teste** (`LEGENDARY_E2E=1`), um `FakeLyricsClient` devolve letras fixas pelo nome da
  faixa, sem rede. Uma das faixas falsas não tem letra, para o teste ver o aviso.
- **Funções puras em `packages/core`:**
  - `parseLrc(texto)`: devolve `{ at, text }[]` em ordem, com `at` em segundos. Aceita mais de um
    tempo na mesma linha e descarta linhas sem texto depois de tirar `♪` e espaços.
  - `isMostlyEnglish(versos, ranks)`: verdadeiro quando ao menos 50% das palavras da letra têm o
    lema na lista de frequência do inglês que o app já carrega.
- **Privacidade:** nome, artista, álbum e duração da faixa vão para o lrclib.net. Nada mais sai do
  computador por causa desta origem.

## 3. Adaptador `SpotifySource`

- Implementa `CaptionSource` (`start`, `stop`, `on`), como o `ws-server`. Recebe `SpotifyPlayer`,
  `LyricsClient`, os `ranks` e um relógio, para os testes controlarem o tempo.
- **Leitura a cada 1 s.** Entre leituras, a posição é estimada como
  `posição lida + (agora − momento da leitura)` enquanto a faixa toca.
- **Eventos que emite:**
  - `song` com `{ id, title }` quando a faixa muda. O título é `"Nome · Artista"`.
  - `track` com `CaptionTrack { source: 'spotify', cues }` quando a letra da faixa chega e passa no
    filtro de inglês. As `cues` são os textos dos versos.
  - `caption` com `CaptionEvent { text, startedAt, source: 'spotify', mediaTitle }` quando a posição
    estimada passa pelo tempo de um verso.
  - `notice` com `'spotify_waiting' | 'spotify_denied' | 'no_lyrics' | null`.
- **Versos no tempo:** um timer aponta para o próximo verso. Ao começar a faixa no meio, ao voltar
  da pausa ou depois de um seek, o verso que está sendo cantado sai uma vez e os anteriores não saem.
- **Seek:** uma leitura que difere mais de 1,5 s da posição estimada conta como seek. Ouvir a mesma
  faixa de novo, pelo modo repetir ou voltando ao início, continua na mesma faixa, e os versos saem
  de novo.
- **Pausa:** com a faixa pausada no Spotify, nada sai até ela voltar a tocar.
- **Avisos:**
  - `closed` ou `stopped` → `spotify_waiting`.
  - `denied` → `spotify_denied`, com leituras seguindo a cada 1 s para notar quando a pessoa libera.
  - Faixa sem letra, com erro de rede ou com letra que não é em inglês → `no_lyrics` até a próxima
    faixa.
  - Faixa com letra → `null`.
- `stop()` cancela o timer e as leituras.

## 4. Sessões por música

- **Origem:** `CaptureOriginSchema` passa a ser `['browser', 'spotify', 'audio']`, e
  `SourceSchema` ganha `'spotify'`. Com origem `spotify`, `session:start` liga o `SpotifySource`, e
  encerrar a sessão o desliga. O servidor da extensão continua ligado como hoje.
- **Troca de música** (evento `song`), no `SessionService`:
  1. Se a música anterior abriu sessão, espera as traduções pendentes dela (até 5 s, o mesmo limite
     do encerramento) e grava `ended_at` na linha dela.
  2. Se essa música teve palavras novas, guarda o id dela como "última música com palavras".
  3. Soma as palavras novas dela ao total da escuta e recomeça o vocabulário.
  4. Versos que chegam durante a troca esperam numa fila e são processados logo depois, na ordem.
- **Linha da sessão:** criada no primeiro verso da música, como hoje. Uma música sem letra não deixa
  linha vazia no histórico. `started_at` é o momento em que a música começou a tocar na sessão.
- **Cards da música anterior:** ficam na tela até o tempo deles acabar. "Já sei" e "Salvar"
  continuam funcionando neles, porque o vocabulário guarda as palavras já mostradas da música
  anterior até a próxima troca.
- **Status:** `elapsedMs` conta a escuta inteira. `newWords` é o total da escuta, ou seja, as músicas
  anteriores somadas à atual. O `notice` vem do `SpotifySource`. O aviso de falta de legenda por
  silêncio (`no_captions`) não vale nesta origem, porque introduções instrumentais passam de 20 s.
- **Encerrar:** se a música atual tem palavras novas, o quiz é dela. Se não tem, é da "última
  música com palavras". Se nenhuma música teve palavras, nenhum quiz abre.
- **Pausar a sessão** (⌘⇧L) ignora os versos, como já faz com as legendas.

## 5. Interface

Cada tela muda primeiro no mockup, na cópia local em `design/` e no projeto do Claude Design, e
depois é conferida com `make test-visual` e na janela real.

- **Menu, frame 1d:**
  - Uma linha nova "Spotify", com o complemento "letras sincronizadas", entre "Navegador" e
    "Áudio do sistema".
  - Sem sessão, as linhas "Navegador" e "Spotify" são clicáveis e salvam `settings.origin`.
  - Com sessão, as linhas de origem ficam com o estilo de linha desativada, e o ✓ fica na origem em
    uso.
  - "Áudio do sistema" continua desativada.
- **Barra de status, frame 1c:**
  - O rótulo da direita mostra "Spotify". Sem nenhum verso ainda, o rótulo vem da origem, e não do
    "Navegador" que aparece hoje.
  - Três avisos novos, na mesma pílula do "Ative as legendas em inglês":
    - `spotify_waiting`: "Abra o Spotify e dê play" · "esperando…"
    - `spotify_denied`: "Libere o controle do Spotify" · "Ajustes › Automação"
    - `no_lyrics`: "Música sem letra em inglês" · "esperando a próxima"
  - O frame 1c ganha o estado "Sem letra em inglês".
- **Histórico, frame 1j:**
  - Uma sessão de exemplo "Man I Need · Olivia Dean", com "Spotify · 3 min · 6 palavras".
  - `sourceLabel('spotify')` é "Spotify", e o cabeçalho e a linha da sessão mostram esse rótulo.

## 6. Empacotamento e permissões

- `electron-builder.yml`:
  - `extendInfo.NSAppleEventsUsageDescription`: "O Legendary lê a música que está tocando no
    Spotify para mostrar a letra."
  - `entitlements` e `entitlementsInherit` apontam para `build/entitlements.mac.plist`. O arquivo
    mantém as permissões padrão do Electron com hardened runtime e acrescenta
    `com.apple.security.automation.apple-events`.
- Sem essas duas mudanças, o app assinado e notarizado nem consegue pedir a permissão.
- No `make dev`, o pedido de permissão aparece em nome do Electron.

## 7. Testes

- **`packages/core`:** `parseLrc`, com tempos, linhas vazias, `♪` e mais de um tempo na mesma linha.
  `isMostlyEnglish`, com letra em inglês, em português e mista.
- **`LyricsClient`**, com `fetch` falso:
  - `/api/get` com letra;
  - ida ao `/api/search` e escolha pela duração;
  - diferença acima de 5 s descartada;
  - erro de rede;
  - cache, inclusive de `null`.
- **`AppleScriptPlayer`**, com o executor do processo falso: Spotify fechado sem chamar o `tell`,
  erro `-1743`, vírgula decimal e campos vazios.
- **`SpotifySource`**, com player, letras e relógio falsos:
  - versos no tempo;
  - início no meio da faixa;
  - pausa e retomada;
  - seek para frente e para trás;
  - troca de faixa;
  - cada um dos avisos;
  - `stop()` cancela tudo.
- **`SessionService`:**
  - uma sessão por música, com `started_at` e `ended_at`;
  - versos na fila durante a troca;
  - traduções pendentes gravadas na sessão da música certa;
  - totais da barra;
  - "Salvar" num card da música anterior;
  - quiz da última música com palavras;
  - nenhuma linha para música sem letra.
- **Contratos e formatação:** os enums novos, os avisos e o rótulo "Spotify".
- **E2E** (`app.spec.ts`), com o `FakeSpotifyPlayer` e letras falsas:
  - escolher "Spotify" no menu;
  - tocar uma faixa e ver cards, o rótulo "Spotify" e o aviso de faixa sem letra;
  - trocar de faixa e ver duas sessões no histórico;
  - encerrar e ver o quiz da última música com palavras.
- **Teste real:** fica com o usuário, no Spotify dele, porque a permissão do macOS precisa do clique
  dele.
