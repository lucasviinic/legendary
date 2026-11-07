import type { CardPlacement, OverlayLayout, SessionStatus, WordCard } from '@legendary/contracts';
import { create } from 'zustand';

/** O card atual e até 6 resumos abaixo dele. */
const MAX_CARDS = 7;
/** Depois desse tempo em destaque, o card encolhe e vira resumo. */
const FOCUS_MS = 10_000;
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

interface OverlayState {
  status: SessionStatus;
  items: Item[];
  placement: CardPlacement;
  safeTop: number;
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
  hovered: null,
  setStatus: (status) =>
    set(status.state === 'idle' ? { status, items: [], hovered: null } : { status }),
  setLayout: ({ placement, safeTop }) => set({ placement, safeTop }),
  setPlacement: (placement) => set({ placement }),
  setHovered: (hovered) => set({ hovered }),
  addCard: (card) =>
    set((state) => {
      const now = Date.now();
      return {
        items: [
          { card, focused: true, focusUntil: now + FOCUS_MS, expiresAt: now + CARD_LIFETIME_MS },
          ...state.items
            .filter((item) => item.card.lemma !== card.lemma)
            .map((item) => ({ ...item, focused: false })),
        ].slice(0, MAX_CARDS),
      };
    }),
  updateCard: (card) =>
    set((state) => ({
      items: state.items.map((item) => {
        if (item.card.lemma !== card.lemma) return item;
        // O destaque recomeça quando a explicação chega, para dar tempo de ler.
        const explained = item.card.explanation === null && card.explanation !== null;
        return { ...item, card, focusUntil: explained ? Date.now() + FOCUS_MS : item.focusUntil };
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
      return {
        items: alive.map((item) => (shouldShrink(item) ? { ...item, focused: false } : item)),
      };
    }),
}));
