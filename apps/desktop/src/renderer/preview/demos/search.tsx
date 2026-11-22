import { useEffect, useState } from 'react';
import { useOverlay } from '../../overlay/store';
import { SearchBar } from '../../search/SearchBar';
import { Subtitle } from '../frames';
import { registerDemo, type Timeline } from './control';
import {
  Keystroke,
  OverlayLayer,
  pending,
  prepareOverlay,
  Scene,
  startSession,
  translated,
  wordCard,
} from './scene';

const SEARCHED = wordCard(
  'out of the blue',
  'idiom',
  'B2',
  'do nada, de repente',
  'Quando algo acontece sem nenhum aviso, de surpresa.',
  'Then, out of the blue, she called me.',
);

const EARLIER = [
  wordCard('knack', 'noun', 'C1', 'jeito, talento', '', ''),
  wordCard('wary', 'adj', 'C1', 'desconfiado, cauteloso', '', ''),
  wordCard('grumpy', 'adj', 'B1', 'mal-humorado, ranzinza', '', ''),
];

const TYPING_GAPS_MS = [90, 70, 85, 60, 110, 65, 80, 95, 70, 120, 60, 75, 85, 70, 90];
const CARD_SECONDS = 3;
const START_WORDS = 7;

const SUBTITLE_AT = 300;
const SHORTCUT_AT = 1_100;
const BAR_AT = 1_200;
const TYPING_AT = 1_550;
const TYPED_AT = TYPING_AT + TYPING_GAPS_MS.reduce((total, gap) => total + gap, 0);
const ENTER_AT = TYPED_AT + 330;
const KEYS_SHOWN_MS = 500;
const CARD_AT = ENTER_AT + 100;
const TRANSLATION_AT = CARD_AT + 450;
const EXPLANATION_AT = CARD_AT + 1_000;
const SUBTITLE_UNTIL = 6_800;
const SHRINK_AT = EXPLANATION_AT + CARD_SECONDS * 1_000 + 50;
const REMOVE_AT = SHRINK_AT + 850;
const DURATION_MS = REMOVE_AT + 700;

function playSearch(
  clock: Timeline,
  setSubtitle: (shown: boolean) => void,
  setQuery: (query: string | null) => void,
  setKeys: (keys: string[] | null) => void,
) {
  const overlay = useOverlay.getState();
  const session = startSession(clock, START_WORDS);
  const query = SEARCHED.lemma;

  clock.at(SUBTITLE_AT, () => setSubtitle(true));
  clock.at(SHORTCUT_AT, () => setKeys(['⌘', '⇧', 'B']));
  clock.at(SHORTCUT_AT + KEYS_SHOWN_MS, () => setKeys(null));
  clock.at(BAR_AT, () => setQuery(''));
  TYPING_GAPS_MS.reduce((at, gap, index) => {
    clock.at(at + gap, () => setQuery(query.slice(0, index + 1)));
    return at + gap;
  }, TYPING_AT);
  clock.at(ENTER_AT, () => setKeys(['↩']));
  clock.at(ENTER_AT + KEYS_SHOWN_MS, () => setKeys(null));
  clock.at(CARD_AT, () => {
    setQuery(null);
    session.addWord();
    overlay.addCard(pending(SEARCHED));
  });
  clock.at(TRANSLATION_AT, () => overlay.updateCard(translated(SEARCHED)));
  clock.at(EXPLANATION_AT, () => overlay.updateCard(SEARCHED));
  clock.at(SUBTITLE_UNTIL, () => setSubtitle(false));
  clock.at(SHRINK_AT, () => overlay.expireCards());
  clock.at(REMOVE_AT, () => overlay.removeCard(SEARCHED.lemma));
}

export function prepareSearch() {
  prepareOverlay({
    newWords: START_WORDS,
    maxSummaries: 6,
    cardSeconds: CARD_SECONDS,
    summaries: EARLIER,
  });
}

export function SearchDemo() {
  const [subtitle, setSubtitle] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [keys, setKeys] = useState<string[] | null>(null);

  useEffect(
    () =>
      registerDemo({
        durationMs: DURATION_MS,
        play: (clock) => playSearch(clock, setSubtitle, setQuery, setKeys),
      }),
    [],
  );

  return (
    <Scene>
      <OverlayLayer />
      {query !== null && (
        <div className="absolute top-[152px] left-1/2 w-[440px] -translate-x-1/2">
          <SearchBar value={query} />
        </div>
      )}
      {subtitle && (
        <Subtitle
          before="Then, "
          word="out of the blue"
          after=", she called me."
          underlined={false}
        />
      )}
      <Keystroke keys={keys} />
    </Scene>
  );
}
