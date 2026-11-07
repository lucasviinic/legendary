import { describe, expect, it } from 'vitest';
import { defaultSettings, type Settings } from '@legendary/contracts';
import { displayKey, overlayLayout, type OverlayDisplay } from './overlay-layout';

/** Medidas reais: o monitor HDMI e a tela do MacBook lidas com o app rodando. */
const hdmi: OverlayDisplay = {
  id: 2,
  label: '27G2G5',
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 30, width: 1920, height: 967 },
};
const macbook: OverlayDisplay = {
  id: 1,
  label: 'Tela Retina Integrada',
  bounds: { x: -1470, y: 0, width: 1470, height: 956 },
  workArea: { x: -1470, y: 33, width: 1470, height: 923 },
};
const dockOnTheLeft: OverlayDisplay = {
  id: 3,
  label: 'Dock',
  bounds: { x: 0, y: 0, width: 1000, height: 800 },
  workArea: { x: 60, y: 30, width: 940, height: 770 },
};

const settings = (overrides: Partial<Settings> = {}): Settings => ({
  ...defaultSettings,
  ...overrides,
});

describe('overlayLayout', () => {
  it('keeps the default card where it always was, below the menu bar', () => {
    expect(overlayLayout(settings(), hdmi).placement).toEqual({ corner: 'tr', x: 20, y: 50 });
    expect(overlayLayout(settings(), macbook).placement).toEqual({ corner: 'tr', x: 20, y: 53 });
  });

  it('keeps the bottom corners above the Dock', () => {
    expect(overlayLayout(settings({ corner: 'br' }), hdmi).placement).toEqual({
      corner: 'br',
      x: 20,
      y: 103,
    });
  });

  it('keeps the left corners beside a Dock on that side', () => {
    expect(overlayLayout(settings({ corner: 'tl' }), dockOnTheLeft).placement).toEqual({
      corner: 'tl',
      x: 80,
      y: 50,
    });
  });

  it('reports how much of the top is taken by the menu bar', () => {
    expect(overlayLayout(settings(), hdmi).safeTop).toBe(30);
    expect(overlayLayout(settings(), macbook).safeTop).toBe(33);
  });

  it('tells the overlay how many summaries to keep', () => {
    expect(overlayLayout(settings(), hdmi).maxSummaries).toBe(6);
    expect(overlayLayout(settings({ maxSummaries: 10 }), hdmi).maxSummaries).toBe(10);
  });

  it('tells the overlay how long a card stays and how many stay open', () => {
    expect(overlayLayout(settings({ cardSeconds: 6, cardsAtOnce: 2 }), hdmi)).toMatchObject({
      cardSeconds: 6,
      cardsAtOnce: 2,
    });
  });

  it('uses the position dragged on this monitor', () => {
    const placed = { corner: 'tr' as const, x: 20, y: 12 };
    const withPlacement = settings({ cardPlacements: { [displayKey(hdmi)]: placed } });
    expect(overlayLayout(withPlacement, hdmi).placement).toEqual(placed);
  });

  it('does not use the position dragged on another monitor', () => {
    const withPlacement = settings({
      cardPlacements: { [displayKey(hdmi)]: { corner: 'bl', x: 1, y: 2 } },
    });
    expect(overlayLayout(withPlacement, macbook).placement).toEqual({ corner: 'tr', x: 20, y: 53 });
  });
});

describe('displayKey', () => {
  it('identifies a monitor by its name, which survives reconnecting it', () => {
    expect(displayKey(hdmi)).toBe('27G2G5');
  });

  it('falls back to the id when the monitor has no name', () => {
    expect(displayKey({ ...hdmi, label: '' })).toBe('2');
  });
});
