import type { CardPlacement, Corner, OverlayLayout, Settings } from '@legendary/contracts';

/** Distância da pilha até a borda da área livre (frame 1a). */
const CARD_MARGIN = 20;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlayDisplay {
  id: number;
  label: string;
  bounds: Rect;
  workArea: Rect;
}

/** O id de um monitor pode mudar ao reconectar. O nome continua o mesmo. */
export const displayKey = ({ id, label }: OverlayDisplay): string => label || String(id);

/** O canto escolhido, sem invadir a barra de menus nem o Dock. */
function defaultPlacement(corner: Corner, { bounds, workArea }: OverlayDisplay): CardPlacement {
  const top = workArea.y - bounds.y;
  const left = workArea.x - bounds.x;
  const bottom = bounds.y + bounds.height - (workArea.y + workArea.height);
  const right = bounds.x + bounds.width - (workArea.x + workArea.width);
  return {
    corner,
    x: (corner[1] === 'l' ? left : right) + CARD_MARGIN,
    y: (corner[0] === 't' ? top : bottom) + CARD_MARGIN,
  };
}

export function overlayLayout(settings: Settings, display: OverlayDisplay): OverlayLayout {
  return {
    placement:
      settings.cardPlacements[displayKey(display)] ?? defaultPlacement(settings.corner, display),
    safeTop: display.workArea.y - display.bounds.y,
    maxSummaries: settings.maxSummaries,
    cardSeconds: settings.cardSeconds,
    cardsAtOnce: settings.cardsAtOnce,
  };
}
