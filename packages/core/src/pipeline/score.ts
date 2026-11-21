import type { Cefr } from '@legendary/contracts';

const RARE_RANK = 20000;

export function scoreWord({ count, rank }: { count: number; rank: number | undefined }): number {
  return count * Math.log10(rank ?? RARE_RANK);
}

export function estimateCefr(rank: number | undefined): Cefr {
  if (rank === undefined) return 'B2';
  if (rank <= 1750) return 'B1';
  return rank <= 5000 ? 'B2' : 'C1';
}
