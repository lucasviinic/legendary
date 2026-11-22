import type { WordCard } from '@legendary/contracts';
import { useEffect, useState } from 'react';
import { useOverlay } from '../../overlay/store';
import { Subtitle } from '../frames';
import { registerDemo, type Timeline } from './control';
import {
  OverlayLayer,
  pending,
  prepareOverlay,
  Scene,
  startSession,
  translated,
  wordCard,
} from './scene';

interface Line {
  before: string;
  word: string;
  after: string;
}

interface ShownLine {
  line: Line;
  underlined: boolean;
}

const BEATS: { card: WordCard; line: Line }[] = [
  {
    card: wordCard(
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
    card: wordCard(
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
    card: wordCard(
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
const DURATION_MS = FADE_AT + 900;
const START_WORDS = 4;

function playCards(clock: Timeline, show: (line: ShownLine | null) => void) {
  const overlay = useOverlay.getState();
  const session = startSession(clock, START_WORDS);
  BEATS.forEach(({ card, line }, index) => {
    const start = index * BEAT_MS;
    clock.at(start + LINE_AT, () => show({ line, underlined: false }));
    clock.at(start + CARD_AT, () => {
      show({ line, underlined: true });
      session.addWord();
      overlay.addCard(pending(card));
    });
    clock.at(start + TRANSLATION_AT, () => overlay.updateCard(translated(card)));
    clock.at(start + EXPLANATION_AT, () => overlay.updateCard(card));
    clock.at(start + LINE_UNTIL, () => show(null));
  });
  BEATS.forEach(({ card }, index) =>
    clock.at(FADE_AT + index * FADE_STEP_MS, () => overlay.removeCard(card.lemma)),
  );
}

export function prepareCards() {
  prepareOverlay({ newWords: START_WORDS, maxSummaries: 6, cardSeconds: 10 });
}

export function CardsDemo() {
  const [shown, setShown] = useState<ShownLine | null>(null);

  useEffect(
    () =>
      registerDemo({
        durationMs: DURATION_MS,
        play: (clock) => playCards(clock, setShown),
      }),
    [],
  );

  return (
    <Scene>
      <OverlayLayer />
      {shown && <Subtitle {...shown.line} underlined={shown.underlined} />}
    </Scene>
  );
}
