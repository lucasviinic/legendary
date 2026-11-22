import { describe, expect, it } from 'vitest';
import type { SessionStatus } from '@legendary/contracts';
import { idleStatus } from './store';
import { statusBarMode } from './status-bar-mode';

const status = (overrides: Partial<SessionStatus>): SessionStatus => ({
  ...idleStatus,
  state: 'active',
  ...overrides,
});

describe('statusBarMode', () => {
  it('shows the whole bar while it is on', () => {
    expect(statusBarMode(status({}), true)).toBe('bar');
    expect(statusBarMode(status({ state: 'paused' }), true)).toBe('bar');
    expect(statusBarMode(status({ notice: 'no_captions' }), true)).toBe('bar');
  });

  it('hides the counts when the bar is off, even while paused', () => {
    expect(statusBarMode(status({}), false)).toBe('hidden');
    expect(statusBarMode(status({ state: 'paused' }), false)).toBe('hidden');
  });

  it('still shows a notice, pulsing, when the bar is off', () => {
    expect(statusBarMode(status({ notice: 'no_captions' }), false)).toBe('pulsing-notice');
    expect(statusBarMode(status({ notice: 'ai_error' }), false)).toBe('pulsing-notice');
  });
});
