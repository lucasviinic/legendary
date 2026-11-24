import type { CaptureOrigin, SessionStatus } from '@legendary/contracts';
import { formatElapsed } from '@legendary/core';
import type { ReactNode } from 'react';

function Row({
  children,
  shortcut,
  disabled,
  highlighted,
  onClick,
}: {
  children: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  highlighted?: boolean;
  onClick?: () => void;
}) {
  const hover = disabled ? '' : 'group hover:bg-white/12';
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`flex h-6 items-center gap-1.5 rounded-md px-2.5 text-left ${hover} ${highlighted ? 'bg-white/12' : ''} ${disabled ? 'text-white/35' : ''}`}
    >
      {children}
      {shortcut && (
        <span
          className={`ml-auto ${disabled ? 'text-white/25' : highlighted ? 'text-white/60' : 'text-white/45 group-hover:text-white/60'}`}
        >
          {shortcut}
        </span>
      )}
    </button>
  );
}

const Separator = () => <div className="mx-2 my-1 h-px bg-white/10" />;

function OriginRow({
  checked,
  disabled,
  hint,
  onClick,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  hint?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Row disabled={disabled} onClick={onClick}>
      <span className="w-3">{checked ? '✓' : ''}</span>
      <span>{children}</span>
      {hint && <span className={disabled ? 'text-white/25' : 'text-white/45'}>{hint}</span>}
    </Row>
  );
}

export interface MenuViewProps {
  status: SessionStatus;
  origin: CaptureOrigin;
  overlayVisible: boolean;
  statusBarVisible: boolean;
  highlightedRow?: 'stop';
  onToggleSession?: () => void;
  onStop?: () => void;
  onToggleOverlay?: () => void;
  onToggleStatusBar?: () => void;
  onHistory?: () => void;
  onSettings?: () => void;
  onQuit?: () => void;
  onPickOrigin?: (origin: CaptureOrigin) => void;
}

const SESSION_LABEL = { idle: 'Iniciar sessão', active: 'Pausar sessão', paused: 'Retomar sessão' };

export function MenuView(props: MenuViewProps) {
  const { status, origin, overlayVisible, statusBarVisible, highlightedRow } = props;
  const idle = status.state === 'idle';

  return (
    <div className="flex flex-col p-[5px] text-[13px] text-white">
      <div className="flex items-center gap-2 px-2.5 pt-2 pb-1.5">
        <span
          className={`size-[7px] rounded-full ${status.state === 'active' ? 'bg-rec' : 'bg-white/40'}`}
        />
        <span className="font-semibold">
          {idle ? 'Nenhuma sessão' : status.state === 'active' ? 'Sessão ativa' : 'Sessão pausada'}
        </span>
        {!idle && (
          <span className="ml-auto text-white/55 tabular-nums">
            {formatElapsed(status.elapsedMs)} · {status.newWords}{' '}
            {status.newWords === 1 ? 'palavra' : 'palavras'}
          </span>
        )}
      </div>
      <Separator />
      <Row shortcut="⌘⇧L" onClick={props.onToggleSession}>
        {SESSION_LABEL[status.state]}
      </Row>
      <Row
        shortcut="⌘⇧E"
        disabled={idle}
        highlighted={highlightedRow === 'stop'}
        onClick={props.onStop}
      >
        Encerrar e fazer o quiz
      </Row>
      <Row shortcut="⌘⇧H" disabled={idle} onClick={props.onToggleOverlay}>
        {overlayVisible ? 'Esconder overlay' : 'Mostrar overlay'}
      </Row>
      <Row disabled={idle} onClick={props.onToggleStatusBar}>
        {statusBarVisible ? 'Esconder barra de status' : 'Mostrar barra de status'}
      </Row>
      <Separator />
      <div className="px-2.5 pt-1 pb-0.5 text-[11px] font-semibold text-white/45">Origem</div>
      <OriginRow
        checked={origin === 'browser'}
        disabled={!idle}
        hint="Netflix, YouTube"
        onClick={() => props.onPickOrigin?.('browser')}
      >
        Navegador
      </OriginRow>
      <OriginRow
        checked={origin === 'spotify'}
        disabled={!idle}
        hint="letras sincronizadas"
        onClick={() => props.onPickOrigin?.('spotify')}
      >
        Spotify
      </OriginRow>
      <OriginRow checked={origin === 'audio'} disabled>
        Áudio do sistema
      </OriginRow>
      <Separator />
      <Row onClick={props.onHistory}>Histórico e palavras salvas…</Row>
      <Row shortcut="⌘," onClick={props.onSettings}>
        Configurações…
      </Row>
      <Separator />
      <Row shortcut="⌘Q" onClick={props.onQuit}>
        Sair do Legendary
      </Row>
    </div>
  );
}
