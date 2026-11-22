import type { SessionStatus } from '@legendary/contracts';

export type StatusBarMode = 'bar' | 'pulsing-notice' | 'hidden';

export function statusBarMode(status: SessionStatus, showStatusBar: boolean): StatusBarMode {
  if (showStatusBar) return 'bar';
  return status.notice === null ? 'hidden' : 'pulsing-notice';
}
