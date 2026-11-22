import type { QuizAnswerResult, QuizQuestionView } from '@legendary/contracts';
import { useEffect, useRef, useState } from 'react';
import { MatchView } from '../../quiz/MatchView';
import { registerDemo, type Pointer, type Timeline } from './control';
import { Cursor } from './scene';

const PAIRS: [string, string][] = [
  ['head out', 'sair, ir embora'],
  ['grumpy', 'mal-humorado'],
  ['stumble upon', 'dar de cara com'],
  ['get by', 'se virar, dar um jeito'],
];

const QUESTION: QuizQuestionView = {
  id: 2,
  type: 'match',
  prompt: 'Arraste cada expressão até o significado',
  options: ['se virar, dar um jeito', 'sair, ir embora', 'dar de cara com', 'mal-humorado'],
  matchWords: ['head out', 'grumpy', 'stumble upon', 'get by'],
  context: null,
};

const RESULT: QuizAnswerResult = {
  correct: true,
  correctAnswer: JSON.stringify(Object.fromEntries(PAIRS)),
  word: 'head out',
  translation: 'sair, ir embora',
  explanation: 'A partícula muda o sentido: head out é sair, get by é se virar.',
  matchResults: PAIRS.map(([word, meaning]) => ({ word, meaning, correct: true })),
};

const WIDTH = 760;
const HEIGHT = 580;
const REST = { x: 380, y: 440 };
const IDLE_MS = 500;
const REACH_MS = 450;
const PRESS_MS = 150;
const DRAG_MS = 700;
const SETTLE_MS = 250;
const RETURN_MS = 600;
const GRADING_MS = 350;
const HOLD_MS = 1_600;
const FADE_MS = 300;

interface Point {
  x: number;
  y: number;
}

interface Segment {
  from: Point;
  to: Point;
  startMs: number;
  durationMs: number;
  down: boolean;
}

const PATH_MS = IDLE_MS + PAIRS.length * (REACH_MS + PRESS_MS + DRAG_MS + SETTLE_MS) + RETURN_MS;
const FADE_AT = PATH_MS + HOLD_MS;
const DURATION_MS = FADE_AT + FADE_MS * 2 + 300;

const ease = (progress: number) =>
  progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;

function centerOf(element: Element | undefined, along: number): Point {
  const box = element!.getBoundingClientRect();
  return { x: box.left + box.width * along, y: box.top + box.height / 2 };
}

function buildPath(root: HTMLElement): Segment[] {
  const frame = root.querySelector('[data-window]')!.getBoundingClientRect();
  const rest = { x: frame.left + REST.x, y: frame.top + REST.y };
  const words = [...root.querySelectorAll<HTMLElement>('[data-testid^="match-word-"]')];
  const meanings = [...root.querySelectorAll<HTMLElement>('[data-meaning]')];
  const segments: Segment[] = [];
  let at = 0;
  let current = rest;
  const go = (to: Point, durationMs: number, down: boolean) => {
    segments.push({ from: current, to, startMs: at, durationMs, down });
    current = to;
    at += durationMs;
  };

  go(rest, IDLE_MS, false);
  for (const [word, meaning] of PAIRS) {
    const grab = centerOf(
      words.find((element) => element.dataset.testid === `match-word-${word}`),
      0.18,
    );
    const drop = centerOf(
      meanings.find((element) => element.dataset.meaning === meaning),
      0.3,
    );
    go(grab, REACH_MS, false);
    go(grab, PRESS_MS, true);
    go(drop, DRAG_MS, true);
    go(drop, SETTLE_MS, false);
  }
  go(rest, RETURN_MS, false);
  return segments;
}

function pointerOn(path: Segment[], elapsedMs: number): Pointer | null {
  const segment =
    path.find(({ startMs, durationMs }) => elapsedMs < startMs + durationMs) ?? path.at(-1);
  if (!segment) return null;
  const progress = Math.min(Math.max((elapsedMs - segment.startMs) / segment.durationMs, 0), 1);
  const eased = ease(progress);
  return {
    x: segment.from.x + (segment.to.x - segment.from.x) * eased,
    y: segment.from.y + (segment.to.y - segment.from.y) * eased,
    down: segment.down && elapsedMs < segment.startMs + segment.durationMs,
  };
}

function playMatch(
  clock: Timeline,
  setFading: (fading: boolean) => void,
  setRound: (next: (round: number) => number) => void,
  setResult: (result: QuizAnswerResult | null) => void,
) {
  clock.at(FADE_AT, () => setFading(true));
  clock.at(FADE_AT + FADE_MS, () => {
    setResult(null);
    setRound((round) => round + 1);
    setFading(false);
  });
}

export function MatchDemo() {
  const root = useRef<HTMLDivElement>(null);
  const [round, setRound] = useState(0);
  const [fading, setFading] = useState(false);
  const [result, setResult] = useState<QuizAnswerResult | null>(null);

  useEffect(() => {
    let path: Segment[] = [];
    return registerDemo({
      durationMs: DURATION_MS,
      play: (clock) => {
        path = buildPath(root.current!);
        playMatch(clock, setFading, setRound, setResult);
      },
      pointerAt: (elapsedMs) => pointerOn(path, elapsedMs),
    });
  }, []);

  return (
    <div ref={root} data-frame className="p-8">
      <div
        data-window
        className="box-content overflow-hidden rounded-xl border border-white/10 bg-surface"
        style={{ width: WIDTH, height: HEIGHT, boxShadow: '0 30px 70px rgba(0,0,0,.3)' }}
      >
        <div className="h-full transition-opacity duration-300" style={{ opacity: fading ? 0 : 1 }}>
          <MatchView
            key={round}
            question={QUESTION}
            position={6}
            total={10}
            result={result}
            onSubmit={() => setTimeout(() => setResult(RESULT), GRADING_MS)}
          />
        </div>
      </div>
      <Cursor />
    </div>
  );
}
