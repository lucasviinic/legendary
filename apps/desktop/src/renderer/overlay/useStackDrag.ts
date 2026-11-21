import { useLayoutEffect, useRef, type PointerEvent } from 'react';
import type { CardPlacement } from '@legendary/contracts';
import { clampDelta, placementFromRect } from './placement';

const DRAG_THRESHOLD_PX = 3;

interface Drag {
  startX: number;
  startY: number;
  rect: DOMRect;
  moved: boolean;
}

export interface StackDragOptions {
  placement: CardPlacement;
  onPlace?: ((placement: CardPlacement) => void) | undefined;
  onDragging?: ((dragging: boolean) => void) | undefined;
}

const screenSize = () => ({ width: window.innerWidth, height: window.innerHeight });

export function useStackDrag({ placement, onPlace, onDragging }: StackDragOptions) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  useLayoutEffect(() => {
    if (ref.current && !drag.current) ref.current.style.transform = '';
  }, [placement]);

  if (!onPlace) return { ref };

  return {
    ref,
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (event.button !== 0 || (event.target as Element).closest('button')) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = {
        startX: event.clientX,
        startY: event.clientY,
        rect: event.currentTarget.getBoundingClientRect(),
        moved: false,
      };
      onDragging?.(true);
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const current = drag.current;
      if (!current) return;
      const x = event.clientX - current.startX;
      const y = event.clientY - current.startY;
      if (!current.moved && Math.hypot(x, y) < DRAG_THRESHOLD_PX) return;
      current.moved = true;
      const delta = clampDelta(current.rect, { x, y }, screenSize());
      event.currentTarget.style.transform = `translate(${delta.x}px, ${delta.y}px)`;
    },
    onLostPointerCapture(event: PointerEvent<HTMLDivElement>) {
      const current = drag.current;
      if (!current) return;
      const rect = event.currentTarget.getBoundingClientRect();
      drag.current = null;
      onDragging?.(false);
      if (current.moved) onPlace(placementFromRect(rect, screenSize()));
    },
  };
}
