import type { QuizAnswerResult, QuizQuestionView } from '@legendary/contracts';
import { questionTypeLabel } from '@legendary/core';
import { useState } from 'react';
import { QuizFrame, Verdict } from './QuizFrame';

const BLANK = '____';
const LONG_PROMPT = 110;

interface Choice {
  value: string;
  label: string;
}

const TRUE_FALSE: Choice[] = [
  { value: 'true', label: 'Verdadeiro' },
  { value: 'false', label: 'Falso' },
];

/** As opções de resposta da questão, ou nulo quando a resposta é digitada. */
export function choicesOf(question: QuizQuestionView): Choice[] | null {
  if (question.type === 'true_false') return TRUE_FALSE;
  return question.options?.map((option) => ({ value: option, label: option })) ?? null;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function Prompt({
  question,
  result,
}: {
  question: QuizQuestionView;
  result: QuizAnswerResult | null;
}) {
  const [before, after] = question.prompt.split(BLANK);
  const size = question.prompt.length > LONG_PROMPT ? 'text-[22px]' : 'text-[28px]';
  const className = `${size} leading-[1.35] font-medium tracking-[-0.2px] text-pretty`;
  if (after === undefined) return <div className={className}>{question.prompt}</div>;

  const color = result ? '#32D74B' : 'rgba(255,255,255,.5)';
  return (
    <div className={className}>
      {before}
      <span
        className="inline-block min-w-[110px] border-b-2 text-center"
        style={{ borderColor: color, color }}
      >
        {result?.correctAnswer ?? ''}
      </span>
      {after}
    </div>
  );
}

function optionStyle(choice: Choice, picked: string | null, result: QuizAnswerResult | null) {
  if (!result) {
    return {
      background: 'rgba(255,255,255,.06)',
      borderColor: 'rgba(255,255,255,.12)',
      opacity: 1,
      mark: '',
    };
  }
  if (same(choice.value, result.correctAnswer)) {
    return { background: 'rgba(50,215,75,.14)', borderColor: '#32D74B', opacity: 1, mark: '✓' };
  }
  if (picked !== null && same(choice.value, picked)) {
    return { background: 'rgba(255,69,58,.14)', borderColor: '#FF6961', opacity: 1, mark: '✕' };
  }
  return {
    background: 'rgba(255,255,255,.06)',
    borderColor: 'rgba(255,255,255,.12)',
    opacity: 0.45,
    mark: '',
  };
}

function Choices({
  choices,
  picked,
  result,
  onAnswer,
}: {
  choices: Choice[];
  picked: string | null;
  result: QuizAnswerResult | null;
  onAnswer?: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {choices.map((choice, index) => {
        const { mark, ...style } = optionStyle(choice, picked, result);
        return (
          <button
            key={choice.value}
            disabled={result !== null}
            onClick={() => onAnswer?.(choice.value)}
            className="flex h-[54px] items-center gap-3 rounded-xl border px-4 text-left text-[16px] font-medium transition-all duration-200"
            style={style}
          >
            <span className="flex size-[22px] flex-none items-center justify-center rounded-md border border-white/20 font-mono text-[11px] text-white/60">
              {index + 1}
            </span>
            <span className="truncate">{choice.label}</span>
            <span className="ml-auto text-[15px]" style={{ color: style.borderColor }}>
              {mark}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Resposta digitada. Não tem frame no mockup: usa as medidas dos botões do frame 1g. */
function TypedAnswer({
  result,
  onAnswer,
}: {
  result: QuizAnswerResult | null;
  onAnswer?: (value: string) => void;
}) {
  const [text, setText] = useState('');
  const border = !result ? 'rgba(255,255,255,.12)' : result.correct ? '#32D74B' : '#FF6961';
  return (
    <input
      autoFocus
      aria-label="Sua resposta"
      disabled={result !== null}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && text.trim()) {
          event.stopPropagation();
          onAnswer?.(text);
        }
      }}
      placeholder="Digite a palavra e aperte Enter"
      className="box-content h-[54px] rounded-xl border bg-white/6 px-4 text-[16px] font-medium outline-none placeholder:text-white/35"
      style={{ borderColor: border }}
    />
  );
}

export interface QuestionViewProps {
  question: QuizQuestionView;
  position: number;
  total: number;
  picked: string | null;
  result: QuizAnswerResult | null;
  onAnswer?: (value: string) => void;
  onNext?: () => void;
}

/** Questão com enunciado e opções: frame 1g. */
export function QuestionView({
  question,
  position,
  total,
  picked,
  result,
  onAnswer,
  onNext,
}: QuestionViewProps) {
  const choices = choicesOf(question);
  return (
    <QuizFrame position={position} total={total}>
      <div className="flex min-h-0 flex-1 flex-col gap-[30px] px-12 pt-7">
        <div className="flex flex-col gap-3.5">
          <span className="text-[11px] font-semibold tracking-[0.6px] text-white/45 uppercase">
            {questionTypeLabel(question.type)}
          </span>
          <Prompt question={question} result={result} />
          {question.context && (
            <span className="text-[12px] text-white/45">{question.context}</span>
          )}
        </div>
        {choices ? (
          <Choices choices={choices} picked={picked} result={result} onAnswer={onAnswer} />
        ) : (
          <TypedAnswer key={question.id} result={result} onAnswer={onAnswer} />
        )}
      </div>
      <div className="flex min-h-24 flex-none items-end px-12 pb-6">
        {result && <Verdict result={result} onNext={onNext} />}
      </div>
    </QuizFrame>
  );
}
