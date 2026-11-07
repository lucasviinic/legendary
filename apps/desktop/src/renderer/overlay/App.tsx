import { useEffect, useRef, useState } from 'react';
import { api } from '../shared/api';
import { CardStack } from './CardStack';
import { StatusBar } from './StatusBar';
import { useOverlay } from './store';

const EXPIRE_CHECK_MS = 500;
const BAR_IDLE_AFTER_MS = 4_000;
const NEAR_TOP_PX = 80;

/** Barra e cards sobre o vídeo. Os cliques atravessam a janela, exceto sobre estes elementos. */
export function App() {
  const { status, items, corner, hovered, setHovered } = useOverlay();
  const [barAwake, setBarAwake] = useState(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const state = useOverlay.getState();
    const legendary = api();
    void legendary.invoke('session:get-status').then(state.setStatus);
    void legendary.invoke('settings:get').then((view) => state.setCorner(view.settings.corner));

    const unsubscribe = [
      legendary.on('session:status', state.setStatus),
      legendary.on('vocab:card', state.addCard),
      legendary.on('vocab:card-update', state.updateCard),
      legendary.on('vocab:card-remove', ({ lemma }) => state.removeCard(lemma)),
      legendary.on('settings:changed', (view) => state.setCorner(view.settings.corner)),
    ];
    const expiry = setInterval(() => useOverlay.getState().expireCards(), EXPIRE_CHECK_MS);
    return () => {
      unsubscribe.forEach((stop) => stop());
      clearInterval(expiry);
    };
  }, []);

  // A janela recebe o movimento do mouse mesmo deixando os cliques passarem (`forward: true`).
  useEffect(() => {
    let interactive = false;
    const wake = () => {
      setBarAwake(true);
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setBarAwake(false), BAR_IDLE_AFTER_MS);
    };
    const onMove = (event: MouseEvent) => {
      if (event.clientY < NEAR_TOP_PX) wake();
      const over = document.elementFromPoint(event.clientX, event.clientY);
      const next = over?.closest('[data-interactive]') != null;
      if (next !== interactive) {
        interactive = next;
        void api().invoke('overlay:set-interactive', { interactive });
      }
    };
    wake();
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      clearTimeout(idleTimer.current);
    };
  }, []);

  if (status.state === 'idle') return null;

  // Pausa e avisos ficam sempre legíveis: só a barra ativa, sem novidade, some sozinha.
  const canFade = status.state === 'active' && status.notice === null;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        data-interactive
        data-testid="status-bar"
        className="absolute top-[18px] left-1/2 -translate-x-1/2 transition-opacity duration-300"
        style={{ opacity: canFade && !barAwake ? 0.22 : 1 }}
      >
        <StatusBar
          status={status}
          onTogglePause={() => void api().invoke('session:toggle-pause')}
          onStop={() => void api().invoke('session:stop')}
        />
      </div>
      <CardStack
        cards={items.map((item) => item.card)}
        corner={corner}
        hovered={hovered}
        onHover={setHovered}
        onKnown={(lemma) => void api().invoke('vocab:mark-known', { lemma })}
        onSave={(lemma) => void api().invoke('vocab:save', { lemma })}
      />
    </div>
  );
}
