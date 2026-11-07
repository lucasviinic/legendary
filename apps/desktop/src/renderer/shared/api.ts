import type { LegendaryApi } from '@legendary/contracts';

declare global {
  interface Window {
    legendary: LegendaryApi;
  }
}

export const api = (): LegendaryApi => window.legendary;
