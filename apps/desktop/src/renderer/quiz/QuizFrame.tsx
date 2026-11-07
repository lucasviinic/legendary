import type { QuizAnswerResult } from '@legendary/contracts';
import type { ReactNode } from 'react';
import { TrafficLights } from '../shared/TrafficLights';

/** Cabeçalho com o progresso, comum às questões. */
export function QuizFrame({
  position,
  total,
  children,
}: {
  position: number;
  total: number;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col bg-surface text-[13px] text-white">
      <div className="drag flex h-[38px] flex-none items-center gap-5 px-3.5">
        <TrafficLights />
        <div className="h-1 flex-1 overflow-hidden rounded-sm bg-white/10">
          <div
            className="h-full rounded-sm bg-white/80"
            style={{ width: `${(position / total) * 100}%` }}
          />
        </div>
        <span className="pr-1.5 text-[12px] text-white/55 tabular-nums">
          {position} de {total}
        </span>
      </div>
      {children}
    </div>
  );
}

/** Painel com o resultado da resposta: parte de baixo do frame 1g. */
export function Verdict({ result, onNext }: { result: QuizAnswerResult; onNext?: () => void }) {
  const pairs = result.matchResults;
  const rightPairs = pairs?.filter((pair) => pair.correct).length ?? 0;
  return (
    <div className="flex flex-1 items-center gap-5 rounded-xl bg-white/5 px-4 py-3.5">
      <div className="flex flex-1 flex-col gap-[3px]">
        <span className={`font-semibold ${result.correct ? 'text-ok' : 'text-bad'}`}>
          {result.correct ? 'Isso!' : 'Quase.'}
        </span>
        <span className="leading-[1.45] text-white/70">
          {pairs ? (
            <>
              {rightPairs} de {pairs.length} pares certos. {result.explanation}
            </>
          ) : (
            <>
              <b className="font-bold text-white">{result.word}</b> ={' '}
              <span className="text-accent">{result.translation}</span>. {result.explanation}
            </>
          )}
        </span>
      </div>
      <button
        onClick={onNext}
        className="flex h-[34px] items-center gap-2 rounded-[9px] bg-white px-4 font-semibold text-ink"
      >
        Próxima <span className="text-[11px] opacity-55">↵</span>
      </button>
    </div>
  );
}
