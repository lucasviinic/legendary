import type { Corner, SessionStatus, WordCard } from '@legendary/contracts';
import { create } from 'zustand';

const MAX_CARDS = 3;
/** Os cards somem sozinhos entre 10 e 15 segundos depois de aparecer. */
const CARD_LIFETIME_MS = 13_000;

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
  expiresAt: number;
}

interface OverlayState {
  status: SessionStatus;
  items: Item[];
  corner: Corner;
  hovered: string | null;
  setStatus(status: SessionStatus): void;
  setCorner(corner: Corner): void;
  setHovered(lemma: string | null): void;
  addCard(card: WordCard): void;
  updateCard(card: WordCard): void;
  removeCard(lemma: string): void;
  expireCards(): void;
}

export const useOverlay = create<OverlayState>((set) => ({
  status: idleStatus,
  items: [],
  corner: 'tr',
  hovered: null,
  setStatus: (status) =>
    set(status.state === 'idle' ? { status, items: [], hovered: null } : { status }),
  setCorner: (corner) => set({ corner }),
  setHovered: (hovered) => set({ hovered }),
  addCard: (card) =>
    set((state) => ({
      items: [
        { card, expiresAt: Date.now() + CARD_LIFETIME_MS },
        ...state.items.filter((item) => item.card.lemma !== card.lemma),
      ].slice(0, MAX_CARDS),
    })),
  updateCard: (card) =>
    set((state) => ({
      items: state.items.map((item) => {
        if (item.card.lemma !== card.lemma) return item;
        // O tempo do card recomeça quando a tradução chega, para dar tempo de ler.
        const translated = item.card.translation === null && card.translation !== null;
        return { card, expiresAt: translated ? Date.now() + CARD_LIFETIME_MS : item.expiresAt };
      }),
    })),
  removeCard: (lemma) =>
    set((state) => ({ items: state.items.filter((item) => item.card.lemma !== lemma) })),
  expireCards: () =>
    set((state) => {
      const now = Date.now();
      const items = state.items.filter(
        (item) => item.expiresAt > now || item.card.lemma === state.hovered,
      );
      return items.length === state.items.length ? state : { items };
    }),
}));
