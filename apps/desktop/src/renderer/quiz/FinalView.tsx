import type { QuizResult } from '@legendary/contracts';
import { questionTypeLabel, scoreHeadline } from '@legendary/core';
import { TrafficLights } from '../shared/TrafficLights';

const SECONDARY =
  'flex h-[34px] items-center rounded-[9px] bg-white/10 px-4 font-medium hover:bg-white/16';

export interface FinalViewProps {
  result: QuizResult;
  onHistory?: () => void;
  onClose?: () => void;
  onReview?: () => void;
}

function reviewNote(mistakes: number) {
  if (mistakes === 0) return 'Nenhum erro nesta rodada.';
  return mistakes === 1
    ? 'A que você errou volta na revisão de amanhã.'
    : `As ${mistakes} que você errou voltam na revisão de amanhã.`;
}

/** Tela final do quiz: frame 1i. */
export function FinalView({ result, onHistory, onClose, onReview }: FinalViewProps) {
  const { score, total, mistakes } = result;
  return (
    <div className="flex h-full flex-col bg-surface text-[13px] text-white">
      <div className="drag flex h-[38px] flex-none items-center px-3.5">
        <TrafficLights />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-6 px-12 pt-3.5">
        <div className="flex items-end gap-5">
          <span className="text-[76px] leading-[0.9] font-semibold tracking-[-2px] tabular-nums">
            {score}
            <span className="text-white/35">/{total}</span>
          </span>
          <div className="flex flex-col gap-[3px] pb-1.5">
            <span className="text-[17px] font-semibold">{scoreHeadline(score, total)}</span>
            <span className="text-white/60">{reviewNote(mistakes.length)}</span>
          </div>
        </div>
        {mistakes.length > 0 && (
          <div className="flex min-h-0 flex-col gap-2.5">
            <span className="font-semibold">Para revisar</span>
            <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto">
              {mistakes.map((mistake, index) => (
                <div
                  key={`${mistake.word}-${index}`}
                  className="flex flex-col gap-1.5 rounded-xl border border-white/8 bg-white/5 px-4 py-3.5"
                >
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-[16px] font-semibold">{mistake.word}</span>
                    <span className="text-[12px] text-white/45">
                      {questionTypeLabel(mistake.type)}
                    </span>
                  </div>
                  <div className="flex gap-[18px] text-[12.5px]">
                    <span className="text-bad">✕ Você: {mistake.userAnswer}</span>
                    <span className="text-ok">✓ Certa: {mistake.correctAnswer}</span>
                  </div>
                  <span className="leading-[1.45] text-white/65">{mistake.explanation}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-none items-center gap-2.5 px-12 pt-[18px] pb-6">
        <button onClick={onHistory} className={SECONDARY}>
          Ver histórico
        </button>
        <button onClick={onClose} className={`ml-auto ${SECONDARY}`}>
          Fechar
        </button>
        {mistakes.length > 0 && (
          <button
            onClick={onReview}
            className="flex h-[34px] items-center rounded-[9px] bg-white px-[18px] font-semibold text-ink"
          >
            Revisar erros de novo
          </button>
        )}
      </div>
    </div>
  );
}
