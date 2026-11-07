import type {
  HistoryList,
  HistoryWord,
  QuizQuestionView,
  QuizResult,
  QuizSummary,
  SessionStatus,
  SettingsView as View,
  WordCard,
} from '@legendary/contracts';
import type { CSSProperties, ReactNode } from 'react';
import { HistoryView } from '../history/HistoryView';
import { MenuView } from '../menu/MenuView';
import { CardStack } from '../overlay/CardStack';
import { StatusBar } from '../overlay/StatusBar';
import { FullCard } from '../overlay/WordCardView';
import { FinalView } from '../quiz/FinalView';
import { MatchView } from '../quiz/MatchView';
import { QuestionView } from '../quiz/QuestionView';
import { SummaryView } from '../quiz/SummaryView';
import { SettingsView } from '../settings/SettingsView';

/** Os dados daqui são os do mockup, para cada tela poder ser comparada com o frame dela. */

const ELAPSED = 24 * 60_000 + 12_000;

const status = (overrides: Partial<SessionStatus> = {}): SessionStatus => ({
  state: 'active',
  elapsedMs: ELAPSED,
  newWords: 12,
  source: 'netflix',
  origin: 'browser',
  notice: null,
  queuedWords: 0,
  ...overrides,
});

const reckon: WordCard = {
  lemma: 'reckon',
  surface: 'reckon',
  pos: 'verb',
  cefr: 'B2',
  translation: 'achar, supor',
  explanation:
    'Jeito informal de dar uma opinião ou fazer uma estimativa. Muito comum no inglês britânico.',
  sentence: 'I reckon we should head out before it gets dark.',
  extraExample: null,
  count: 3,
  saved: false,
};

const compact = (lemma: string, translation: string): WordCard => ({
  ...reckon,
  lemma,
  surface: lemma,
  translation,
});

const headOut: WordCard = {
  lemma: 'head out',
  surface: 'head out',
  pos: 'phrasal verb',
  cefr: 'B1',
  translation: 'sair, ir embora',
  explanation: 'Sair de um lugar rumo a outro. Bem mais natural que “leave” numa conversa.',
  sentence: 'I reckon we should head out before it gets dark.',
  extraExample: null,
  count: 1,
  saved: false,
};

const grumpy: WordCard = {
  lemma: 'grumpy',
  surface: 'grumpy',
  pos: 'adj',
  cefr: 'B1',
  translation: 'mal-humorado, ranzinza',
  explanation: 'Irritado por pouca coisa, geralmente de um jeito passageiro.',
  sentence: "Don't mind him, he's just grumpy.",
  extraExample: "She's always grumpy before her first coffee.",
  count: 2,
  saved: true,
};

const getBy: WordCard = {
  ...reckon,
  lemma: 'get by',
  surface: 'get by',
  pos: 'phrasal verb',
  translation: null,
};

const settingsView: View = {
  settings: {
    provider: 'claude',
    level: 'B2',
    cardsPerMinute: 2,
    corner: 'tr',
    highlightSubtitles: true,
    origin: 'browser',
    wsPort: 47615,
    onboarded: true,
  },
  keys: {
    gemini: { mask: 'AIza••••••••••••••••7Qk', status: 'ok' },
    claude: { mask: 'sk-ant-••••••••••••••3f9a', status: 'ok' },
    deepseek: { mask: 'sk-••••••••••••••••b21c', status: 'ok' },
  },
  pairing: { token: 'abc', port: 47615, connected: true },
};

const WORDS: [string, string][] = [
  ['reckon', 'achar, supor'],
  ['head out', 'sair, ir embora'],
  ['grumpy', 'mal-humorado'],
  ['stumble upon', 'dar de cara com'],
  ['get by', 'se virar'],
  ['figure out', 'entender, descobrir'],
  ['wary', 'desconfiado'],
  ['bail on', 'deixar na mão'],
  ['mess up', 'estragar, errar'],
  ['hunch', 'pressentimento'],
  ['knack', 'jeito, talento'],
  ['fed up', 'de saco cheio'],
];

const summary: QuizSummary = {
  sessionId: 1,
  title: 'Northbound · T1E3',
  durationMs: 42 * 60_000 + 18_000,
  newWords: 18,
  savedWords: 3,
  words: WORDS.map(([word, translation], index) => ({
    senseId: index,
    word,
    translation,
    selected: word !== 'figure out' && word !== 'mess up',
  })),
};

const cloze: QuizQuestionView = {
  id: 1,
  type: 'cloze',
  prompt: '“I ____ we should head out before it gets dark.”',
  options: ['wonder', 'reckon', 'doubt', 'figure'],
  matchWords: null,
  context: 'Northbound · T1E3 · 12:04',
};

const match: QuizQuestionView = {
  id: 2,
  type: 'match',
  prompt: 'Arraste cada expressão até o significado',
  options: ['se virar, dar um jeito', 'sair, ir embora', 'dar de cara com', 'mal-humorado'],
  matchWords: ['head out', 'grumpy', 'stumble upon', 'get by'],
  context: null,
};

const finalResult: QuizResult = {
  quizId: 1,
  sessionId: 1,
  score: 8,
  total: 10,
  mistakes: [
    {
      word: 'get by',
      type: 'context_sense',
      userAnswer: 'passar por perto',
      correctAnswer: 'se virar, dar um jeito',
      explanation:
        "“We don't have much, but we get by.” Aqui é sobreviver com pouco, não se mover.",
    },
    {
      word: 'stumble upon',
      type: 'type_word',
      userAnswer: 'stumble into',
      correctAnswer: 'stumble upon',
      explanation: 'Encontrar algo por acaso. “Into” existe, mas quer dizer esbarrar em alguém.',
    },
  ],
};

const NOW = new Date(2026, 10, 6, 21, 40).getTime();
const DAY = 86_400_000;
const session = (
  id: number,
  title: string,
  source: HistoryList['sessions'][number]['source'],
  daysAgo: number,
  minutes: number,
  wordCount: number,
  quiz: { score: number; total: number } | null,
) => ({
  id,
  title,
  source,
  startedAt: NOW - daysAgo * DAY,
  durationMs: minutes * 60_000,
  wordCount,
  quiz,
});

const history: HistoryList = {
  counts: { all: 214, saved: 31, dueToday: 9 },
  sessions: [
    {
      ...session(1, 'Northbound · T1E3', 'netflix', 0, 42, 18, { score: 8, total: 10 }),
      startedAt: new Date(2026, 10, 6, 21, 2).getTime(),
      durationMs: 42 * 60_000 + 18_000,
    },
    session(2, 'Northbound · T1E2', 'netflix', 1, 48, 22, { score: 7, total: 10 }),
    session(3, 'How tides actually work', 'youtube', 1, 14, 6, null),
    session(4, 'Northbound · T1E1', 'netflix', 3, 51, 25, { score: 9, total: 10 }),
    session(5, 'Podcast · áudio do sistema', 'audio', 3, 33, 11, { score: 6, total: 8 }),
  ],
};

const IN_THREE_DAYS = NOW + 3 * DAY;
const TOMORROW = NOW + DAY;
const row = (
  senseId: number,
  lemma: string,
  translation: string,
  seen: number,
  answered: [number, number],
  cefr: HistoryWord['cefr'],
  dueAt: number | null,
  saved = false,
): HistoryWord => ({
  senseId,
  lemma,
  translation,
  seen,
  correct: answered[0],
  answered: answered[1],
  cefr,
  dueAt,
  saved,
});

const historyWords: HistoryWord[] = [
  row(1, 'reckon', 'achar, supor', 3, [1, 1], 'B2', IN_THREE_DAYS, true),
  row(2, 'head out', 'sair, ir embora', 2, [1, 1], 'B1', IN_THREE_DAYS),
  row(3, 'get by', 'se virar, dar um jeito', 2, [0, 1], 'B2', TOMORROW, true),
  row(4, 'stumble upon', 'dar de cara com', 1, [0, 1], 'B2', TOMORROW),
  row(5, 'grumpy', 'mal-humorado, ranzinza', 2, [1, 1], 'B1', IN_THREE_DAYS, true),
  row(6, 'wary', 'desconfiado, cauteloso', 1, [1, 1], 'C1', IN_THREE_DAYS),
  row(7, 'bail on', 'deixar na mão', 1, [1, 1], 'B2', IN_THREE_DAYS),
  row(8, 'hunch', 'pressentimento', 2, [1, 1], 'B2', IN_THREE_DAYS),
  row(9, 'knack', 'jeito, talento', 1, [1, 1], 'C1', IN_THREE_DAYS),
  row(10, 'fed up', 'de saco cheio', 1, [0, 0], 'B1', null),
  row(11, 'wonder', 'se perguntar', 1, [0, 0], 'B1', null),
];

const SCENE_DARK =
  'radial-gradient(ellipse 50% 60% at 28% 62%,#4a3426 0%,transparent 70%),radial-gradient(ellipse 45% 50% at 78% 38%,#1f3346 0%,transparent 70%),radial-gradient(ellipse 30% 25% at 55% 80%,#2b2a22 0%,transparent 70%),linear-gradient(180deg,#0b0d11,#14181e)';
const SCENE_LIGHT =
  'radial-gradient(ellipse 50% 55% at 22% 32%,#fbf0d6 0%,transparent 70%),radial-gradient(ellipse 45% 55% at 80% 70%,#b7d3e6 0%,transparent 70%),radial-gradient(ellipse 35% 30% at 60% 25%,#f3f6f8 0%,transparent 70%),linear-gradient(180deg,#e8e2d6,#c9d4db)';

const SUBTITLE: CSSProperties = {
  textShadow: '0 2px 3px rgba(0,0,0,.9),0 0 12px rgba(0,0,0,.6)',
};

function Subtitle({ before, word, after }: { before: string; word: string; after: string }) {
  return (
    <div
      className="absolute inset-x-0 bottom-[70px] text-center text-[32px] font-medium text-white"
      style={SUBTITLE}
    >
      {before}
      <span className="underline decoration-accent decoration-[3px] underline-offset-[7px]">
        {word}
      </span>
      {after}
    </div>
  );
}

function BarAt({ opacity = 1, children }: { opacity?: number; children: ReactNode }) {
  return (
    <div className="absolute top-[18px] left-1/2 -translate-x-1/2" style={{ opacity }}>
      {children}
    </div>
  );
}

function WindowFrame({
  width,
  height,
  children,
}: {
  width: number;
  height?: number;
  children: ReactNode;
}) {
  return (
    <div
      data-frame
      className="box-content overflow-hidden rounded-xl border border-white/10 bg-surface"
      style={{ width, height, boxShadow: '0 30px 70px rgba(0,0,0,.3)' }}
    >
      {children}
    </div>
  );
}

function StateLabel({ children }: { children: ReactNode }) {
  return <span className="text-[11px] text-white/55">{children}</span>;
}

function SheetTitle({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-semibold tracking-[0.6px] text-white/55 uppercase">
      {children}
    </div>
  );
}

export const FRAMES: Record<string, () => ReactNode> = {
  '1a': () => (
    <div
      data-frame
      className="relative h-[720px] w-[1280px] overflow-hidden rounded-lg [--glass-bg:rgba(30,30,34,0.58)]"
      style={{ background: SCENE_DARK }}
    >
      <BarAt>
        <StatusBar status={status()} />
      </BarAt>
      <CardStack
        cards={[
          reckon,
          compact('stumble upon', 'dar de cara com'),
          compact('grumpy', 'mal-humorado'),
        ]}
        corner="tr"
        hovered={null}
      />
      <Subtitle before="I " word="reckon" after=" we should head out before it gets dark." />
    </div>
  ),
  '1b': () => (
    <div
      data-frame
      className="relative h-[720px] w-[1280px] overflow-hidden rounded-lg"
      style={{ background: SCENE_LIGHT }}
    >
      <BarAt opacity={0.22}>
        <StatusBar status={status({ source: 'youtube' })} />
      </BarAt>
      <CardStack cards={[headOut, compact('reckon', 'achar, supor')]} corner="tr" hovered={null} />
      <Subtitle before="I reckon we should " word="head out" after=" before it gets dark." />
    </div>
  ),
  '1c': () => (
    <div
      data-frame
      className="box-border grid w-[820px] grid-cols-[minmax(0,1fr)_320px] gap-9 overflow-hidden rounded-lg p-8 text-white [--glass-bg:rgba(30,30,34,0.58)]"
      style={{
        background:
          'radial-gradient(ellipse 60% 60% at 25% 40%,#3d4a3a 0%,transparent 70%),radial-gradient(ellipse 50% 60% at 80% 70%,#5a4a62 0%,transparent 70%),linear-gradient(160deg,#20242a,#2c2a30)',
      }}
    >
      <div className="flex flex-col gap-[18px]">
        <SheetTitle>Barra de status</SheetTitle>
        <div className="flex flex-col items-start gap-1.5">
          <StateLabel>Ativa</StateLabel>
          <StatusBar status={status()} />
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <StateLabel>Pausada (⌘⇧L) — cards param de aparecer</StateLabel>
          <StatusBar status={status({ state: 'paused' })} />
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <StateLabel>Sem legenda detectada</StateLabel>
          <StatusBar status={status({ notice: 'no_captions' })} />
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <StateLabel>Erro de API / sem internet</StateLabel>
          <StatusBar status={status({ notice: 'ai_error', queuedWords: 3 })} />
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <StateLabel>Ociosa — mouse longe do topo</StateLabel>
          <div style={{ opacity: 0.22 }}>
            <StatusBar status={status()} />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-[18px]">
        <SheetTitle>Cards</SheetTitle>
        <div className="flex flex-col gap-1.5">
          <StateLabel>IA carregando a tradução</StateLabel>
          <FullCard card={getBy} hovered={false} />
        </div>
        <div className="flex flex-col gap-1.5">
          <StateLabel>Hover num card antigo — cresce e mostra outro exemplo</StateLabel>
          <FullCard card={grumpy} hovered />
        </div>
      </div>
    </div>
  ),
  '1d': () => (
    <div
      data-frame
      className="relative h-[440px] w-[520px] overflow-hidden rounded-lg text-white"
      style={{
        background:
          'radial-gradient(ellipse 70% 60% at 30% 70%,#2a3a52 0%,transparent 70%),linear-gradient(180deg,#1a2030,#262033)',
      }}
    >
      <div className="flex h-[26px] items-center justify-end gap-4 bg-[rgba(20,20,24,.45)] px-3.5 text-[13px]">
        <span className="flex h-5 items-center rounded-[5px] bg-white/20 px-[7px]">
          <span className="relative box-border flex h-3 w-[17px] flex-col items-center justify-end gap-[1.5px] rounded-[3px] border-[1.5px] border-white pb-0.5">
            <span className="h-[1.5px] w-[9px] rounded-[1px] bg-white" />
            <span className="h-[1.5px] w-1.5 rounded-[1px] bg-white" />
            <span className="absolute -top-[3px] -right-[3px] size-[5px] rounded-full bg-rec" />
          </span>
        </span>
        <span className="text-white/85">Sex 6 nov 21:40</span>
      </div>
      <div
        className="absolute top-[30px] right-24 w-[300px] overflow-hidden rounded-xl border border-white/13 shadow-[0_18px_50px_rgba(0,0,0,0.45)]"
        style={{ background: 'rgba(40,40,46,0.72)', backdropFilter: 'blur(30px) saturate(180%)' }}
      >
        <MenuView status={status()} origin="browser" overlayVisible highlightedRow="stop" />
      </div>
    </div>
  ),
  '1e': () => (
    <WindowFrame width={560}>
      <SettingsView view={settingsView} showPairing={false} />
    </WindowFrame>
  ),
  '1f': () => (
    <WindowFrame width={760} height={580}>
      <SummaryView
        summary={summary}
        excluded={
          new Set(summary.words.filter((word) => !word.selected).map((word) => word.senseId))
        }
      />
    </WindowFrame>
  ),
  '1g': () => (
    <WindowFrame width={760} height={580}>
      <QuestionView question={cloze} position={3} total={10} picked={null} result={null} />
    </WindowFrame>
  ),
  '1h': () => (
    <WindowFrame width={760} height={580}>
      <MatchView
        question={match}
        position={6}
        total={10}
        result={null}
        initialPairs={{ 'head out': 'sair, ir embora', grumpy: 'mal-humorado' }}
        initialDrag={{ word: 'stumble upon', x: 365, y: 257, over: 'dar de cara com' }}
      />
    </WindowFrame>
  ),
  '1i': () => (
    <WindowFrame width={760} height={580}>
      <FinalView result={finalResult} />
    </WindowFrame>
  ),
  '1j': () => (
    <WindowFrame width={1100} height={660}>
      <HistoryView
        list={history}
        scope={{ kind: 'session', sessionId: 1 }}
        filter="all"
        search=""
        words={historyWords}
        total={historyWords.length}
        now={NOW}
      />
    </WindowFrame>
  ),
};
