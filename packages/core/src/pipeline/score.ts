import type { Cefr } from '@legendary/contracts';

/** Posição usada para expressões, que não têm posição própria na lista de frequência. */
const RARE_RANK = 20000;

/** Frequência na sessão × raridade geral. */
export function scoreWord({ count, rank }: { count: number; rank: number | undefined }): number {
  return count * Math.log10(rank ?? RARE_RANK);
}

/** Nível provisório mostrado no card até a IA responder. */
export function estimateCefr(rank: number | undefined): Cefr {
  if (rank === undefined) return 'B2';
  if (rank <= 2000) return 'B1';
  return rank <= 6000 ? 'B2' : 'C1';
}
