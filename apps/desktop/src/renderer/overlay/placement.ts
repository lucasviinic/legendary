import type { CardPlacement, Corner } from '@legendary/contracts';

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Delta {
  x: number;
  y: number;
}

/** Prende a pilha ao canto mais próximo, para ela crescer na direção certa ao receber cards. */
export function placementFromRect(rect: Box, screen: Size): CardPlacement {
  const right = rect.left + rect.width / 2 > screen.width / 2;
  const bottom = rect.top + rect.height / 2 > screen.height / 2;
  return {
    corner: `${bottom ? 'b' : 't'}${right ? 'r' : 'l'}` as Corner,
    x: Math.max(0, Math.round(right ? screen.width - rect.left - rect.width : rect.left)),
    y: Math.max(0, Math.round(bottom ? screen.height - rect.top - rect.height : rect.top)),
  };
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Limita o movimento para a pilha não sair da tela. */
export function clampDelta(rect: Box, delta: Delta, screen: Size): Delta {
  return {
    x: clamp(delta.x, -rect.left, screen.width - rect.left - rect.width),
    y: clamp(delta.y, -rect.top, screen.height - rect.top - rect.height),
  };
}
