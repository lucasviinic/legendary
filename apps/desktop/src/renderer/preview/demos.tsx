import type { SessionStatus, WordCard } from '@legendary/contracts';
import { useEffect, useState, type ReactNode } from 'react';
import { CardStack } from '../overlay/CardStack';
import { StatusBar } from '../overlay/StatusBar';
import { useOverlay } from '../overlay/store';
import { BarAt, SCENE_DARK, Subtitle, TOP_RIGHT } from './frames';

interface DemoControl {
  durationMs: number;
  start(): void;
  advance(deltaMs: number): void;
}

declare global {
  interface Window {
    demo?: DemoControl;
  }
}

interface Line {
  before: string;
  word: string;
  after: string;
}

interface ShownLine {
  line: Line;
  underlined: boolean;
}

const word = (
  lemma: string,
  pos: string,
  cefr: WordCard['cefr'],
  translation: string,
  explanation: string,
  sentence: string,
): WordCard => ({
  lemma,
  surface: lemma,
  pos,
  cefr,
  translation,
  explanation,
  sentence,
  extraExample: null,
  count: 1,
  saved: false,
  known: false,
});

const BEATS: { card: WordCard; line: Line }[] = [
  {
    card: word(
      'knack',
      'noun',
      'C1',
      'jeito, talento',
      'Habilidade natural para fazer algo bem, quase sem esforço.',
      "You've got a knack for this.",
    ),
    line: { before: "You've got a ", word: 'knack', after: ' for this.' },
  },
  {
    card: word(
      'wary',
      'adj',
      'C1',
      'desconfiado, cauteloso',
      'Cauteloso porque desconfia de algo ou de alguém.',
      "She's been wary of him from the start.",
    ),
    line: { before: "She's been ", word: 'wary', after: ' of him from the start.' },
  },
  {
    card: word(
      'grumpy',
      'adj',
      'B1',
      'mal-humorado, ranzinza',
      'Irritado por pouca coisa, geralmente de um jeito passageiro.',
      "Don't mind him, he's just grumpy.",
    ),
    line: { before: "Don't mind him, he's just ", word: 'grumpy', after: '.' },
  },
];

const BEAT_MS = 3_200;
const LINE_AT = 400;
const CARD_AT = 700;
const TRANSLATION_AT = 1_150;
const EXPLANATION_AT = 1_700;
const LINE_UNTIL = 2_900;
const FADE_AT = BEATS.length * BEAT_MS + 300;
const FADE_STEP_MS = 160;
const CARDS_DEMO_MS = FADE_AT + 900;
const START_ELAPSED_MS = 12 * 60_000 + 4_000;
const START_WORDS = 4;

const activeStatus = (elapsedMs: number, newWords: number): SessionStatus => ({
  state: 'active',
  elapsedMs,
  newWords,
  source: 'netflix',
  origin: 'browser',
  notice: null,
  queuedWords: 0,
});

const animationTimes = new WeakMap<Animation, number>();

function advanceAnimations(deltaMs: number) {
  for (const animation of document.getAnimations()) {
    const seen = animationTimes.get(animation);
    if (seen === undefined) animation.pause();
    const end = Number(animation.effect?.getComputedTiming().endTime ?? Infinity);
    const time = Math.min((seen ?? 0) + deltaMs, end);
    animationTimes.set(animation, time);
    if (time >= end) animation.finish();
    else animation.currentTime = time;
  }
}

function playCards(show: (line: ShownLine | null) => void): () => void {
  const overlay = useOverlay.getState();
  const timers: ReturnType<typeof setTimeout>[] = [];
  const at = (ms: number, run: () => void) => timers.push(setTimeout(run, ms));
  let elapsedMs = START_ELAPSED_MS;
  let newWords = START_WORDS;
  const ticker = setInterval(() => {
    elapsedMs += 1_000;
    overlay.setStatus(activeStatus(elapsedMs, newWords));
  }, 1_000);

  BEATS.forEach(({ card, line }, index) => {
    const start = index * BEAT_MS;
    at(start + LINE_AT, () => show({ line, underlined: false }));
    at(start + CARD_AT, () => {
      show({ line, underlined: true });
      newWords += 1;
      overlay.setStatus(activeStatus(elapsedMs, newWords));
      overlay.addCard({ ...card, translation: null, explanation: null });
    });
    at(start + TRANSLATION_AT, () => overlay.updateCard({ ...card, explanation: null }));
    at(start + EXPLANATION_AT, () => overlay.updateCard(card));
    at(start + LINE_UNTIL, () => show(null));
  });
  BEATS.forEach(({ card }, index) =>
    at(FADE_AT + index * FADE_STEP_MS, () => overlay.removeCard(card.lemma)),
  );

  return () => {
    timers.forEach(clearTimeout);
    clearInterval(ticker);
  };
}

function CardsDemo() {
  const { status, items, hovered } = useOverlay();
  const [shown, setShown] = useState<ShownLine | null>(null);

  useEffect(() => {
    const overlay = useOverlay.getState();
    overlay.setLayout({
      placement: TOP_RIGHT,
      safeTop: 0,
      maxSummaries: 6,
      cardSeconds: 10,
      cardsAtOnce: 1,
      showStatusBar: true,
    });
    overlay.setStatus(activeStatus(START_ELAPSED_MS, START_WORDS));
    let stop: () => void = () => undefined;
    window.demo = {
      durationMs: CARDS_DEMO_MS,
      start: () => {
        stop = playCards(setShown);
      },
      advance: advanceAnimations,
    };
    return () => {
      stop();
      delete window.demo;
    };
  }, []);

  return (
    <div data-frame className="p-8">
      <div
        className="relative h-[720px] w-[1280px] overflow-hidden rounded-xl shadow-[0_18px_40px_rgba(0,0,0,0.28)] [--glass-bg:rgba(30,30,34,0.58)]"
        style={{ background: SCENE_DARK }}
      >
        <BarAt opacity={0.22}>
          <StatusBar status={status} />
        </BarAt>
        <CardStack
          cards={items.map((item) => item.card)}
          placement={TOP_RIGHT}
          openCards={items.filter((item) => item.focused).length}
          hovered={hovered}
        />
        {shown && <Subtitle {...shown.line} underlined={shown.underlined} />}
      </div>
    </div>
  );
}

export const DEMOS: Record<string, () => ReactNode> = {
  cards: () => <CardsDemo />,
};
