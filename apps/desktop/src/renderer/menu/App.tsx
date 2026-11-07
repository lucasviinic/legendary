import type { CaptureOrigin, SessionStatus } from '@legendary/contracts';
import { useEffect, useState } from 'react';
import { api } from '../shared/api';
import { useFitWindow } from '../shared/useFitWindow';
import { idleStatus } from '../overlay/store';
import { MenuView } from './MenuView';

export function App() {
  const [status, setStatus] = useState<SessionStatus>(idleStatus);
  const [origin, setOrigin] = useState<CaptureOrigin>('browser');
  const [overlayVisible, setOverlayVisible] = useState(true);
  const root = useFitWindow<HTMLDivElement>();

  useEffect(() => {
    const legendary = api();
    void legendary.invoke('session:get-status').then(setStatus);
    void legendary.invoke('settings:get').then((view) => setOrigin(view.settings.origin));
    const unsubscribe = [
      legendary.on('session:status', (next) => {
        setStatus(next);
        if (next.state === 'idle') setOverlayVisible(true);
      }),
      legendary.on('settings:changed', (view) => setOrigin(view.settings.origin)),
      legendary.on('overlay:visibility', ({ visible }) => setOverlayVisible(visible)),
    ];
    return () => unsubscribe.forEach((stop) => stop());
  }, []);

  const run = (action: () => unknown) => () => {
    void api().invoke('menu:hide');
    action();
  };

  return (
    <div
      ref={root}
      className="overflow-hidden rounded-xl border border-white/13 bg-[rgba(40,40,46,0.72)]"
    >
      <MenuView
        status={status}
        origin={origin}
        overlayVisible={overlayVisible}
        onToggleSession={run(() =>
          status.state === 'idle'
            ? api().invoke('session:start', { source: origin })
            : api().invoke('session:toggle-pause'),
        )}
        onStop={run(() => api().invoke('session:stop'))}
        onToggleOverlay={run(() => api().invoke('overlay:toggle'))}
        onHistory={run(() => api().invoke('window:open', { window: 'history' }))}
        onSettings={run(() => api().invoke('window:open', { window: 'settings' }))}
        onQuit={run(() => api().invoke('app:quit'))}
      />
    </div>
  );
}
