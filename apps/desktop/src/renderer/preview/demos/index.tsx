import type { ReactNode } from 'react';
import { CardsDemo, prepareCards } from './cards';
import { MatchDemo } from './match';
import { prepareSearch, SearchDemo } from './search';

export const DEMOS: Record<string, () => ReactNode> = {
  cards: () => {
    prepareCards();
    return <CardsDemo />;
  },
  search: () => {
    prepareSearch();
    return <SearchDemo />;
  },
  match: () => <MatchDemo />,
};
