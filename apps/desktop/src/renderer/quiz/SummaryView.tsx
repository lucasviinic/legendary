import type { QuizSummary } from '@legendary/contracts';
import { formatElapsed } from '@legendary/core';
import { TrafficLights } from '../shared/TrafficLights';

const MINUTES_PER_QUESTION = 0.4;

export interface SummaryViewProps {
  summary: QuizSummary;
  excluded: ReadonlySet<number>;
  preparing?: boolean;
  onToggle?: (senseId: number) => void;
  onStart?: () => void;
  onSkip?: () => void;
}

/** Resumo da sessão antes do quiz: frame 1f. */
export function SummaryView({
  summary,
  excluded,
  preparing,
  onToggle,
  onStart,
  onSkip,
}: SummaryViewProps) {
  const selected = summary.words.filter((word) => !excluded.has(word.senseId)).length;
  const questions = Math.min(selected, summary.maxQuestions);
  const minutes = Math.max(1, Math.round(questions * MINUTES_PER_QUESTION));

  return (
    <div className="flex h-full flex-col bg-surface text-[13px] text-white">
      <div className="drag flex h-[38px] flex-none items-center px-3.5">
        <TrafficLights />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-[22px] px-9 pt-2.5">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold tracking-[0.6px] text-white/45 uppercase">
            Sessão encerrada
          </span>
          <span className="text-[26px] font-semibold tracking-[-0.3px]">{summary.title}</span>
          <span className="text-white/60">
            {formatElapsed(summary.durationMs)} assistidos · {summary.newWords} palavras novas ·{' '}
            {summary.savedWords} salvas
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="font-semibold">Palavras do quiz</span>
          <span className="text-[12px] text-white/50">
            {selected} de {summary.words.length} selecionadas · desmarque as que não quer testar
          </span>
        </div>
        {/* Com 15 ou 20 questões a grade não cabe na janela e rola. */}
        <div className="grid min-h-0 grid-cols-3 content-start gap-2 overflow-y-auto">
          {summary.words.map((word) => {
            const on = !excluded.has(word.senseId);
            return (
              <button
                key={word.senseId}
                role="checkbox"
                aria-checked={on}
                onClick={() => onToggle?.(word.senseId)}
                className="flex items-center gap-2.5 rounded-[10px] border border-white/8 bg-white/5 px-3 py-[9px] text-left"
                style={{ opacity: on ? 1 : 0.5 }}
              >
                <span
                  className="box-border flex size-4 flex-none items-center justify-center rounded-[4px] border-[1.5px] border-white/40 text-[11px] font-bold text-surface"
                  style={{ background: on ? '#fff' : 'transparent' }}
                >
                  {on ? '✓' : ''}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold">{word.word}</span>
                  <span className="truncate text-[12px] text-accent">{word.translation}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-none items-center justify-end gap-2.5 px-9 pt-[18px] pb-6">
        <span className="text-[12px] text-white/45">
          {preparing
            ? 'Preparando as questões…'
            : `${questions} ${questions === 1 ? 'questão' : 'questões'} · uns ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`}
        </span>
        <button
          onClick={onSkip}
          className="flex h-[34px] items-center gap-2 rounded-[9px] bg-white/10 px-4 font-medium"
        >
          Agora não <span className="text-[11px] opacity-55">esc</span>
        </button>
        <button
          disabled={questions === 0 || preparing}
          onClick={onStart}
          className="flex h-[34px] items-center gap-2 rounded-[9px] bg-white px-[18px] font-semibold text-ink disabled:opacity-40"
        >
          Começar quiz <span className="text-[11px] opacity-55">↵</span>
        </button>
      </div>
    </div>
  );
}
