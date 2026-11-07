import {
  defaultSettings,
  type CardPlacement,
  type OverlayLayout,
  type SessionStatus,
  type WordCard,
} from '@legendary/contracts';
import { create } from 'zustand';

/** Sem cards novos para empurrar os resumos, eles saem de cena sozinhos. */
const CARD_LIFETIME_MS = 3 * 60_000;

export const idleStatus: SessionStatus = {
  state: 'idle',
  elapsedMs: 0,
  newWords: 0,
  source: null,
  origin: 'browser',
  notice: null,
  queuedWords: 0,
};

interface Item {
  card: WordCard;
  focused: boolean;
  focusUntil: number;
  expiresAt: number;
}

/** Os cards abertos ficam em cima, e os resumos, do mais novo para o mais velho, embaixo. */
const openFirst = (items: Item[]) => [
  ...items.filter((item) => item.focused),
  ...items.filter((item) => !item.focused),
];
const withinLimit = (items: Item[], maxSummaries: number) =>
  items.slice(0, items.filter((item) => item.focused).length + maxSummaries);

interface OverlayState {
  status: SessionStatus;
  items: Item[];
  placement: CardPlacement;
  safeTop: number;
  maxSummaries: number;
  cardSeconds: number;
  cardsAtOnce: number;
  hovered: string | null;
  setStatus(status: SessionStatus): void;
  setLayout(layout: OverlayLayout): void;
  setPlacement(placement: CardPlacement): void;
  setHovered(lemma: string | null): void;
  addCard(card: WordCard): void;
  updateCard(card: WordCard): void;
  removeCard(lemma: string): void;
  expireCards(): void;
}

export const useOverlay = create<OverlayState>((set) => ({
  status: idleStatus,
  items: [],
  placement: { corner: 'tr', x: 20, y: 20 },
  safeTop: 0,
  maxSummaries: defaultSettings.maxSummaries,
  cardSeconds: defaultSettings.cardSeconds,
  cardsAtOnce: defaultSettings.cardsAtOnce,
  hovered: null,
  setStatus: (status) =>
    set(status.state === 'idle' ? { status, items: [], hovered: null } : { status }),
  setLayout: ({ placement, safeTop, maxSummaries, cardSeconds, cardsAtOnce }) =>
    set((state) => ({
      placement,
      safeTop,
      maxSummaries,
      cardSeconds,
      cardsAtOnce,
      items: withinLimit(state.items, maxSummaries),
    })),
  setPlacement: (placement) => set({ placement }),
  setHovered: (hovered) => set({ hovered }),
  addCard: (card) =>
    set((state) => {
      const now = Date.now();
      const fresh: Item = {
        card,
        focused: true,
        focusUntil: now + state.cardSeconds * 1000,
        expiresAt: now + CARD_LIFETIME_MS,
      };
      // Os abertos mais novos continuam abertos, até o limite. Os outros viram resumo.
      let room = state.cardsAtOnce - 1;
      const others = state.items
        .filter((item) => item.card.lemma !== card.lemma)
        .map((item) => {
          if (!item.focused) return item;
          room -= 1;
          return room >= 0 ? item : { ...item, focused: false };
        });
      return { items: withinLimit(openFirst([fresh, ...others]), state.maxSummaries) };
    }),
  updateCard: (card) =>
    set((state) => ({
      items: state.items.map((item) => {
        if (item.card.lemma !== card.lemma) return item;
        // O destaque recomeça quando a explicação chega, para dar tempo de ler.
        const explained = item.card.explanation === null && card.explanation !== null;
        const focusUntil = explained ? Date.now() + state.cardSeconds * 1000 : item.focusUntil;
        return { ...item, card, focusUntil };
      }),
    })),
  removeCard: (lemma) =>
    set((state) => ({ items: state.items.filter((item) => item.card.lemma !== lemma) })),
  expireCards: () =>
    set((state) => {
      const now = Date.now();
      const isHovered = (item: Item) => item.card.lemma === state.hovered;
      const shouldShrink = (item: Item) =>
        item.focused && item.focusUntil <= now && !isHovered(item);
      const alive = state.items.filter((item) => item.expiresAt > now || isHovered(item));
      if (alive.length === state.items.length && !alive.some(shouldShrink)) return state;
      const items = alive.map((item) => (shouldShrink(item) ? { ...item, focused: false } : item));
      return { items: withinLimit(openFirst(items), state.maxSummaries) };
    }),
}));
