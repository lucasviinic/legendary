import type { SessionStatus } from '@legendary/contracts';
import { formatElapsed, sourceLabel } from '@legendary/core';
import { Glass } from '../shared/Glass';

const PILL = 'flex items-center rounded-full text-[12.5px] whitespace-nowrap text-white';
const Divider = () => <span className="h-3.5 w-px bg-white/18" />;

function wordsLabel(count: number) {
  return count === 1 ? '1 palavra nova' : `${count} palavras novas`;
}

function RoundButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="flex size-[26px] items-center justify-center rounded-full bg-white/10 hover:bg-white/18"
    >
      {children}
    </button>
  );
}

export interface StatusBarProps {
  status: SessionStatus;
  onTogglePause?: () => void;
  onStop?: () => void;
}

/** Barra de status do overlay: frame 1a e os estados do frame 1c. */
export function StatusBar({ status, onTogglePause, onStop }: StatusBarProps) {
  const time = formatElapsed(status.elapsedMs);

  if (status.notice === 'no_captions') {
    return (
      <Glass className={`${PILL} h-[26px] gap-2.5 px-3.5 py-1.5`}>
        <span className="size-1.5 rounded-full border-[1.5px] border-warn" />
        <span>Ative as legendas em inglês</span>
        <span className="text-white/50">· esperando…</span>
      </Glass>
    );
  }

  if (status.notice === 'ai_error') {
    return (
      <Glass className={`${PILL} h-[26px] gap-2.5 px-3.5 py-1.5`}>
        <span className="size-2 rounded-full bg-warn" />
        <span>Sem conexão com a IA</span>
        <span className="text-white/50">
          · {status.queuedWords} {status.queuedWords === 1 ? 'palavra' : 'palavras'} na fila
        </span>
      </Glass>
    );
  }

  if (status.state === 'paused') {
    return (
      <Glass className={`${PILL} gap-3 py-1.5 pr-1.5 pl-3.5`}>
        <span className="size-2 rounded-full bg-white/40" />
        <span className="font-semibold">Pausada</span>
        <span className="text-white/60 tabular-nums">{time}</span>
        <Divider />
        <span className="text-white/60">{wordsLabel(status.newWords)}</span>
        <RoundButton label="Continuar sessão" onClick={onTogglePause}>
          <span className="ml-0.5 size-0 border-y-[5px] border-l-8 border-y-transparent border-l-white" />
        </RoundButton>
      </Glass>
    );
  }

  return (
    <Glass className={`${PILL} gap-3 py-1.5 pr-1.5 pl-3.5 shadow-[0_10px_30px_rgba(0,0,0,0.28)]`}>
      <span className="size-2 animate-rec-pulse rounded-full bg-rec" />
      <span className="font-semibold tabular-nums">{time}</span>
      <Divider />
      <span>{wordsLabel(status.newWords)}</span>
      <Divider />
      <span className="text-white/60">
        {status.source ? sourceLabel(status.source) : 'Navegador'}
      </span>
      <div className="ml-0.5 flex gap-1">
        <RoundButton label="Pausar sessão" onClick={onTogglePause}>
          <span className="flex gap-[3px]">
            <span className="h-2.5 w-[2.5px] rounded-[1px] bg-white" />
            <span className="h-2.5 w-[2.5px] rounded-[1px] bg-white" />
          </span>
        </RoundButton>
        <button
          onClick={onStop}
          className="flex h-[26px] items-center rounded-full bg-white/10 px-[11px] text-[12px] font-medium hover:bg-white/18"
        >
          Encerrar
        </button>
      </div>
    </Glass>
  );
}
