# Legendary

App para macOS que ensina vocabulário em inglês enquanto você assiste Netflix ou YouTube. Ele lê as
legendas em tempo real, mostra a tradução das palavras novas em um overlay discreto e, no fim da
sessão, faz um quiz com elas. Tudo fica salvo localmente, sem conta nem servidor.

A especificação completa está em `Legendary — especificação técnica de implementação.md`.

## Como rodar

Requisitos: macOS 13 ou mais novo, Homebrew e Xcode Command Line Tools.

```bash
brew install node@22 pnpm
make setup
make dev       # app Electron
make dev-ext   # extensão, em outro terminal
```

O `Makefile` usa o Node 22 do Homebrew mesmo que ele não seja o padrão da máquina.

Na primeira execução, o app pede a API key (Gemini, Claude ou DeepSeek) e o nível de inglês. Depois,
copie o código mostrado no app e cole no popup da extensão para conectar as duas.

## Comandos

| Comando | O que faz |
| --- | --- |
| `make ci` | Lint, tipos e testes de unidade e integração |
| `make test-e2e` | Testes ponta a ponta no app real, inclusive com a extensão em um Chromium |
| `make test-visual` | Compara cada tela com o frame do mockup, em `design/reference` |
| `make package` | Gera o `.dmg` local, sem assinatura |
| `make help` | Lista todos os alvos |

## UI

A referência visual é o mockup do Claude Design, com cópia local em `design/`. Toda mudança de UI
precisa ser conferida contra ele. As telas são componentes sem acesso ao IPC, e a página
`src/renderer/preview` os monta com os dados do mockup para o `make test-visual` comparar.

## Diferenças em relação à especificação

- **Vidro do overlay:** sem `vibrancy` na janela do overlay. Vibrancy vale para a janela inteira e
  embaçaria o vídeo todo, então os cards usam só CSS, sem blur real do que está atrás. O vidro fica
  isolado na classe `.glass`, em `src/renderer/shared/theme.css`.
- **Menu da barra:** é uma janela própria (`windows/menu.ts`), porque um menu nativo não reproduz o
  frame 1d.
- **Áudio do sistema:** ainda não existe (fase 4). A opção aparece desabilitada no menu e o
  `make build-native` só avisa que não há nada para compilar.
- **Versões:** TypeScript 6.0, e não 7, porque o `typescript-eslint` ainda não aceita o 7. As demais
  usam a última versão com mais de 24 h de publicada, exigência do pnpm 12.
- **Lint de importação:** `eslint-plugin-import-x` no lugar do `eslint-plugin-import`, que não aceita
  ESLint 10. A regra continua se chamando `import/no-restricted-paths`.
- **SM-2:** o primeiro acerto agenda a revisão para 3 dias, como no mockup. O SM-2 clássico usa 1 dia.
- **Quiz sem IA:** se a chave faltar ou a chamada falhar, o quiz é montado localmente com as palavras
  da sessão.
- **Fila de tradução:** a especificação pedia lotes de 5 palavras ou 8 segundos, mas os cards saem um
  por vez e cada palavra esperava os 8 segundos inteiros. Agora a palavra de um card vai na hora, e
  as 3 melhores palavras que esperam a vez são traduzidas antes, em até 6 das 10 chamadas por minuto.
- **Resposta da IA:** a tradução vem em streaming, para aparecer antes da explicação, e o raciocínio
  dos modelos fica desligado nessa etapa. No Claude, a tradução usa o Haiku 5.5 e o quiz, o Opus 5.5.
- **Tempo dos cards:** a especificação previa de 10 a 15 segundos e o mockup desenha 3 cards. O card
  fica até 10 segundos em destaque, encolhe e continua como resumo por até 3 minutos.
- **Cards por minuto:** a especificação ia de 1 a 4. Agora vai até 10, um card a cada 6 segundos, nos
  passos 1, 2, 4, 6, 8 e 10. O "até 2" continua em 33% da faixa, como no frame 1e.
- **Resumos na tela:** de 1 a 10, com padrão 6. A linha não tem frame no mockup. Um resumo dura até
  3 minutos, então só dá para ver 10 deles a partir de 4 cards por minuto.
- **Busca de palavra:** não está na especificação nem no mockup. O atalho ⌘⇧B abre uma barra durante
  a sessão, e a palavra digitada vira um card na hora, fora do limite por minuto, e entra no histórico
  e no quiz. Ela usa a frase de uma legenda recente que tenha a palavra e, se não houver, um exemplo
  da IA. A opção "Ao buscar", nas Configurações, volta o vídeo 10 segundos e vem desligada por
  padrão. Na Netflix isso usa a API interna do player, porque mudar o `currentTime` do vídeo gera
  erro, e pode parar de funcionar se ela mudar.
- **Posição dos cards:** além dos 4 cantos, a pilha pode ser arrastada para qualquer ponto da tela, e
  cada monitor guarda a própria posição. Para isso a janela do overlay cobre a tela inteira, inclusive
  a faixa da barra de menus. Escolher um canto nas Configurações apaga as posições arrastadas.

## Dados de terceiros

A lista de frequência deriva do projeto FrequencyWords, sob CC BY-SA 4.0. Veja
`apps/desktop/resources/NOTICE.md`.
