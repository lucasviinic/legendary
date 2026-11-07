import { describe, expect, it } from 'vitest';
import { clampDelta, placementFromRect } from './placement';

const screen = { width: 1920, height: 1080 };
const rect = (left: number, top: number, width = 300, height = 200) => ({
  left,
  top,
  width,
  height,
});

describe('placementFromRect', () => {
  it('anchors to the top right corner', () => {
    expect(placementFromRect(rect(1600, 12), screen)).toEqual({ corner: 'tr', x: 20, y: 12 });
  });

  it('anchors to the top left corner', () => {
    expect(placementFromRect(rect(40, 60), screen)).toEqual({ corner: 'tl', x: 40, y: 60 });
  });

  it('anchors to the bottom right corner, measuring from the bottom', () => {
    expect(placementFromRect(rect(1600, 800), screen)).toEqual({ corner: 'br', x: 20, y: 80 });
  });

  it('anchors to the bottom left corner', () => {
    expect(placementFromRect(rect(40, 800), screen)).toEqual({ corner: 'bl', x: 40, y: 80 });
  });

  it('chooses the corner by the middle of the stack', () => {
    expect(placementFromRect(rect(700, 100), screen).corner).toBe('tl');
    expect(placementFromRect(rect(900, 100), screen).corner).toBe('tr');
    expect(placementFromRect(rect(100, 400), screen).corner).toBe('tl');
    expect(placementFromRect(rect(100, 500), screen).corner).toBe('bl');
  });

  it('rounds to whole pixels', () => {
    expect(placementFromRect(rect(1599.6, 12.4), screen)).toEqual({ corner: 'tr', x: 20, y: 12 });
  });
});

describe('clampDelta', () => {
  const start = rect(1600, 50);

  it('follows the mouse inside the screen', () => {
    expect(clampDelta(start, { x: -100, y: 40 }, screen)).toEqual({ x: -100, y: 40 });
  });

  it('reaches the very top of the screen and stops there', () => {
    expect(clampDelta(start, { x: 0, y: -50 }, screen)).toEqual({ x: 0, y: -50 });
    expect(clampDelta(start, { x: 0, y: -500 }, screen)).toEqual({ x: 0, y: -50 });
  });

  it('stops at the right and bottom edges', () => {
    expect(clampDelta(start, { x: 900, y: 0 }, screen)).toEqual({ x: 20, y: 0 });
    expect(clampDelta(start, { x: 0, y: 5000 }, screen)).toEqual({ x: 0, y: 830 });
  });

  it('stops at the left edge', () => {
    expect(clampDelta(start, { x: -5000, y: 0 }, screen)).toEqual({ x: -1600, y: 0 });
  });
});
