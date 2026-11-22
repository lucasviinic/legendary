import type { SessionStatus, WordCard } from '@legendary/contracts';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { CardStack } from '../../overlay/CardStack';
import { StatusBar } from '../../overlay/StatusBar';
import { useOverlay } from '../../overlay/store';
import { BarAt, SCENE_DARK, TOP_RIGHT } from '../frames';
import type { Timeline } from './control';

const START_ELAPSED_MS = 12 * 60_000 + 4_000;

export const wordCard = (
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

export const pending = (card: WordCard): WordCard => ({
  ...card,
  translation: null,
  explanation: null,
});

export const translated = (card: WordCard): WordCard => ({ ...card, explanation: null });

const activeStatus = (elapsedMs: number, newWords: number): SessionStatus => ({
  state: 'active',
  elapsedMs,
  newWords,
  source: 'netflix',
  origin: 'browser',
  notice: null,
  queuedWords: 0,
});

export function prepareOverlay({
  newWords,
  maxSummaries,
  cardSeconds,
  summaries = [],
}: {
  newWords: number;
  maxSummaries: number;
  cardSeconds: number;
  summaries?: WordCard[];
}) {
  const overlay = useOverlay.getState();
  overlay.setLayout({
    placement: TOP_RIGHT,
    safeTop: 0,
    maxSummaries,
    cardSeconds,
    cardsAtOnce: 1,
    showStatusBar: true,
  });
  overlay.setStatus(activeStatus(START_ELAPSED_MS, newWords));
  useOverlay.setState({
    items: summaries.map((card) => ({
      card,
      focused: false,
      focusUntil: 0,
      expiresAt: Infinity,
    })),
  });
}

export function startSession(clock: Timeline, newWords: number) {
  const overlay = useOverlay.getState();
  let elapsedMs = START_ELAPSED_MS;
  let words = newWords;
  const publish = () => overlay.setStatus(activeStatus(elapsedMs, words));
  clock.every(1_000, () => {
    elapsedMs += 1_000;
    publish();
  });
  return {
    addWord: () => {
      words += 1;
      publish();
    },
  };
}

export function Scene({ children }: { children: ReactNode }) {
  return (
    <div data-frame className="p-8">
      <div
        className="relative h-[720px] w-[1280px] overflow-hidden rounded-xl shadow-[0_18px_40px_rgba(0,0,0,0.28)] [--glass-bg:rgba(30,30,34,0.58)]"
        style={{ background: SCENE_DARK }}
      >
        {children}
      </div>
    </div>
  );
}

export function OverlayLayer() {
  const { status, items, hovered } = useOverlay();
  return (
    <>
      <BarAt opacity={0.22}>
        <StatusBar status={status} />
      </BarAt>
      <CardStack
        cards={items.map((item) => item.card)}
        placement={TOP_RIGHT}
        openCards={items.filter((item) => item.focused).length}
        hovered={hovered}
      />
    </>
  );
}

export function Keystroke({ keys }: { keys: string[] | null }) {
  return (
    <AnimatePresence>
      {keys && (
        <motion.div
          key={keys.join('')}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="glass absolute bottom-6 left-6 flex gap-1.5 rounded-[14px] p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.28)]"
        >
          {keys.map((key) => (
            <span
              key={key}
              className="flex h-8 min-w-5 items-center justify-center rounded-lg border border-white/14 bg-white/10 px-1.5 text-[16px] font-medium text-white"
            >
              {key}
            </span>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Cursor() {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const follow = (event: PointerEvent) => setAt({ x: event.clientX, y: event.clientY });
    window.addEventListener('pointermove', follow, true);
    window.addEventListener('pointerdown', follow, true);
    return () => {
      window.removeEventListener('pointermove', follow, true);
      window.removeEventListener('pointerdown', follow, true);
    };
  }, []);
  if (!at) return null;
  return (
    <svg
      width="24"
      height="30"
      viewBox="0 0 24 30"
      className="pointer-events-none fixed z-50"
      style={{ left: at.x - 3, top: at.y - 2, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }}
    >
      <path
        d="M3 2 L3 23.5 L8.6 18.4 L12.4 27.2 L16.2 25.6 L12.5 17 L19.8 17 Z"
        fill="#111"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
