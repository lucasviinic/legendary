import type {
  HistoryFilter,
  HistoryList,
  HistoryScope,
  HistorySession,
  HistoryWord,
} from '@legendary/contracts';
import {
  formatNextReview,
  formatSessionHeader,
  formatSessionMeta,
  sessionGroupLabel,
} from '@legendary/core';
import { TrafficLights } from '../shared/TrafficLights';

const COLUMNS = 'grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_70px_90px_60px_120px] gap-3';

const FILTERS: { value: HistoryFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'saved', label: 'Salvas' },
  { value: 'wrong', label: 'Erradas' },
  { value: 'B1', label: 'B1' },
  { value: 'B2', label: 'B2' },
  { value: 'C1', label: 'C1' },
];

function NavItem({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-7 items-center justify-between rounded-[7px] px-2.5 text-left ${active ? 'bg-white/10' : 'hover:bg-white/5'}`}
    >
      <span>{label}</span>
      <span className="text-white/45">{count}</span>
    </button>
  );
}

function groupSessions(sessions: HistorySession[], now: number) {
  const groups = new Map<string, HistorySession[]>();
  for (const session of sessions) {
    const label = sessionGroupLabel(session.startedAt, now);
    groups.set(label, [...(groups.get(label) ?? []), session]);
  }
  return [...groups];
}

function hitsText(word: HistoryWord) {
  return word.answered === 0 ? '—' : `${word.correct}/${word.answered}`;
}

const SCOPE_TITLES = { all: 'Todas as palavras', saved: 'Salvas', due: 'Para revisar hoje' };

export interface HistoryViewProps {
  list: HistoryList;
  scope: HistoryScope;
  filter: HistoryFilter;
  search: string;
  words: HistoryWord[];
  total: number;
  now: number;
  onScope?: (scope: HistoryScope) => void;
  onFilter?: (filter: HistoryFilter) => void;
  onSearch?: (search: string) => void;
  onRetake?: (sessionId: number) => void;
}

/** Janela de histórico: frame 1j. */
export function HistoryView(props: HistoryViewProps) {
  const { list, scope, filter, search, words, total, now } = props;
  const selected =
    scope.kind === 'session'
      ? list.sessions.find((session) => session.id === scope.sessionId)
      : undefined;

  return (
    <div className="flex h-full bg-surface text-[13px] text-white">
      <div className="flex w-[250px] flex-none flex-col overflow-y-auto border-r border-white/7 bg-white/3.5">
        <div className="drag flex h-[38px] flex-none items-center px-3.5">
          <TrafficLights />
        </div>
        <div className="flex flex-col gap-0.5 px-2.5 py-1.5">
          <NavItem
            label="Todas as palavras"
            count={list.counts.all}
            active={scope.kind === 'all'}
            onClick={() => props.onScope?.({ kind: 'all' })}
          />
          <NavItem
            label="Salvas"
            count={list.counts.saved}
            active={scope.kind === 'saved'}
            onClick={() => props.onScope?.({ kind: 'saved' })}
          />
          <NavItem
            label="Para revisar hoje"
            count={list.counts.dueToday}
            active={scope.kind === 'due'}
            onClick={() => props.onScope?.({ kind: 'due' })}
          />
        </div>
        {groupSessions(list.sessions, now).map(([label, sessions]) => (
          <div key={label} className="flex flex-col gap-0.5 px-2.5 pt-2.5 pb-0.5">
            <span className="px-2.5 pb-1 text-[11px] font-semibold text-white/40">{label}</span>
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => props.onScope?.({ kind: 'session', sessionId: session.id })}
                className={`flex flex-col gap-px rounded-[7px] px-2.5 py-[7px] text-left ${selected?.id === session.id ? 'bg-white/10' : 'hover:bg-white/5'}`}
              >
                <span className="truncate font-medium">{session.title}</span>
                <span className="text-[11.5px] text-white/50">{formatSessionMeta(session)}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-end gap-4 px-7 pt-[22px] pb-4">
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-[22px] font-semibold tracking-[-0.2px]">
              {selected ? selected.title : scope.kind === 'session' ? '' : SCOPE_TITLES[scope.kind]}
            </span>
            <span className="text-white/55">
              {selected
                ? formatSessionHeader(selected, now)
                : `${total} ${total === 1 ? 'palavra' : 'palavras'}`}
            </span>
          </div>
          {selected && (
            <button
              onClick={() => props.onRetake?.(selected.id)}
              className="flex h-[30px] items-center rounded-lg bg-white/10 px-3.5 font-medium hover:bg-white/16"
            >
              Refazer quiz
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 px-7 pb-3.5">
          <input
            aria-label="Buscar palavra ou tradução"
            value={search}
            onChange={(event) => props.onSearch?.(event.target.value)}
            placeholder="Buscar palavra ou tradução"
            className="h-7 w-[220px] rounded-[7px] border border-white/10 bg-white/6 px-2.5 text-[13px] outline-none placeholder:text-white/40"
          />
          {FILTERS.map((item) => (
            <button
              key={item.value}
              onClick={() => props.onFilter?.(item.value)}
              className={`flex h-[26px] items-center rounded-full border border-white/10 px-[11px] text-[12px] font-medium ${
                item.value === filter ? 'bg-white/90 text-ink' : 'text-white/75'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-7">
          <div
            className={`${COLUMNS} border-b border-white/8 px-2.5 py-2 text-[11.5px] font-semibold text-white/45`}
          >
            <span>Palavra</span>
            <span>Tradução</span>
            <span className="text-right">Apareceu</span>
            <span className="text-right">Acertos</span>
            <span>Nível</span>
            <span>Próxima revisão</span>
          </div>
          {words.map((word, index) => (
            <div
              key={word.senseId}
              data-testid={`history-row-${word.lemma}`}
              className={`${COLUMNS} h-[38px] items-center rounded-[7px] px-2.5 ${index % 2 ? '' : 'bg-white/2.5'}`}
            >
              <span className="flex items-center gap-1.5 font-semibold">
                {word.lemma}
                <span className="text-[10px] text-white/50">{word.saved ? '★' : ''}</span>
              </span>
              <span className="truncate text-accent">{word.translation}</span>
              <span className="text-right text-white/70 tabular-nums">×{word.seen}</span>
              <span
                className={`text-right tabular-nums ${word.answered > 0 && word.correct === 0 ? 'text-bad' : 'text-white/70'}`}
              >
                {hitsText(word)}
              </span>
              <span className="text-[12px] text-white/55">{word.cefr}</span>
              <span className="text-white/70">{formatNextReview(word.dueAt, now)}</span>
            </div>
          ))}
          {words.length === 0 && (
            <div className="py-10 text-center text-white/45">
              {list.sessions.length === 0
                ? 'Ainda não há sessões. Comece uma pela barra de menus.'
                : 'Nenhuma palavra encontrada.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
