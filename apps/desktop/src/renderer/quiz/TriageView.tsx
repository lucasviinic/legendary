import type { TriageWord } from '@legendary/contracts';
import { Sentence } from '../shared/Sentence';
import { QuizFrame } from './QuizFrame';

function Choice({ arrow, label, onClick }: { arrow: string; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-[54px] items-center gap-3 rounded-xl border border-white/12 bg-white/6 px-4 text-left text-[16px] font-medium"
    >
      <span className="flex size-[22px] flex-none items-center justify-center rounded-md border border-white/20 text-[14px] text-white/70">
        {arrow}
      </span>
      {label}
    </button>
  );
}

export interface TriageViewProps {
  word: TriageWord;
  position: number;
  total: number;
  onKnown?: () => void;
  onUnknown?: () => void;
  onBack?: () => void;
  onSkip?: () => void;
}

/** Triagem ao encerrar, antes do resumo: frame 2a. As setas estão no App, junto das outras teclas. */
export function TriageView({
  word,
  position,
  total,
  onKnown,
  onUnknown,
  onBack,
  onSkip,
}: TriageViewProps) {
  return (
    <QuizFrame position={position} total={total}>
      <div className="flex min-h-0 flex-1 flex-col gap-[30px] px-12 pt-7">
        <div className="flex flex-col gap-3.5">
          <span className="text-[11px] font-semibold tracking-[0.6px] text-white/45 uppercase">
            Você já sabe esta?
          </span>
          <div className="flex items-center gap-3">
            <span data-testid="triage-word" className="text-[34px] font-semibold tracking-[-0.4px]">
              {word.word}
            </span>
            <span className="rounded-md border border-white/18 px-[7px] py-0.5 text-[11px] whitespace-nowrap text-white/62">
              {word.cefr ? `${word.cefr} · ${word.pos}` : word.pos}
            </span>
          </div>
          <span className="text-[17px] font-medium text-accent">{word.translation}</span>
          {word.sentence && (
            <span className="text-[14px] leading-[1.45] text-white/80 italic">
              <Sentence sentence={word.sentence} surface={word.word} thick />
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Choice arrow="↑" label="Já sei" onClick={onKnown} />
          <Choice arrow="↓" label="Não sei" onClick={onUnknown} />
        </div>
      </div>
      <div className="flex flex-none items-center justify-between px-12 pb-6">
        <button
          disabled={position === 1}
          onClick={onBack}
          className="flex h-[34px] items-center gap-2 rounded-[9px] bg-white/10 px-4 font-medium disabled:opacity-40"
        >
          <span className="text-[11px] opacity-55">←</span> Voltar
        </button>
        <button
          onClick={onSkip}
          className="flex h-[34px] items-center gap-2 rounded-[9px] bg-white px-[18px] font-semibold text-ink"
        >
          Pular para o resumo <span className="text-[11px] opacity-55">↵</span>
        </button>
      </div>
    </QuizFrame>
  );
}
