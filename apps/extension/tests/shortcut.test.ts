import { describe, expect, it } from 'vitest';
import { isSearchShortcut } from '../lib/shortcut';

const press = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('isSearchShortcut', () => {
  it('recognizes Command, Shift and B', () => {
    expect(isSearchShortcut(press({ code: 'KeyB', metaKey: true, shiftKey: true }))).toBe(true);
  });

  it.each([
    ['Command and B alone', { code: 'KeyB', metaKey: true }],
    ['B alone', { code: 'KeyB' }],
    ['another letter', { code: 'KeyL', metaKey: true, shiftKey: true }],
    ['Control too', { code: 'KeyB', metaKey: true, shiftKey: true, ctrlKey: true }],
    ['Option too', { code: 'KeyB', metaKey: true, shiftKey: true, altKey: true }],
    ['the key held down', { code: 'KeyB', metaKey: true, shiftKey: true, repeat: true }],
  ])('ignores %s', (_name, init) => {
    expect(isSearchShortcut(press(init))).toBe(false);
  });
});
