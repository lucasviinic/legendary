import type { QuizAnswerResult, QuizQuestionView } from '@legendary/contracts';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { QuizFrame, Verdict } from './QuizFrame';

const ROW = 'box-content flex h-[50px] items-center rounded-xl border px-4';
const NEUTRAL = 'border-white/12 bg-white/6';
const MATCHED = 'justify-between border-accent/45 bg-accent/10';
const WORD = 'text-[16px] font-semibold';
const MEANING = 'text-[15px]';

export interface MatchDrag {
  word: string;
  x: number;
  y: number;
  over: string | null;
}

export interface MatchViewProps {
  question: QuizQuestionView;
  position: number;
  total: number;
  result: QuizAnswerResult | null;
  initialPairs?: Record<string, string>;
  initialDrag?: MatchDrag | null;
  onSubmit?: (answer: string) => void;
  onNext?: () => void;
}

function resultClass(correct: boolean | undefined) {
  if (correct === undefined) return null;
  return correct ? 'justify-between border-ok bg-ok/14' : 'justify-between border-bad bg-bad/14';
}

/** Questão de associar arrastando: frame 1h. */
export function MatchView({
  question,
  position,
  total,
  result,
  initialPairs = {},
  initialDrag = null,
  onSubmit,
  onNext,
}: MatchViewProps) {
  const words = question.matchWords ?? [];
  const meanings = question.options ?? [];
  const [pairs, setPairs] = useState<Record<string, string>>(initialPairs);
  const [drag, setDrag] = useState<MatchDrag | null>(initialDrag);
  const dragRef = useRef<MatchDrag | null>(initialDrag);

  const update = (next: MatchDrag | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  const meaningAt = (x: number, y: number) =>
    document
      .elementsFromPoint(x, y)
      .map((element) => element.closest<HTMLElement>('[data-meaning]')?.dataset.meaning)
      .find(Boolean) ?? null;

  const onPointerDown = (word: string, event: ReactPointerEvent<HTMLElement>) => {
    if (result) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPairs(({ [word]: _removed, ...rest }) => rest);
    update({ word, x: event.clientX, y: event.clientY, over: null });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const current = dragRef.current;
    if (!current) return;
    update({
      ...current,
      x: event.clientX,
      y: event.clientY,
      over: meaningAt(event.clientX, event.clientY),
    });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const current = dragRef.current;
    if (!current) return;
    const target = meaningAt(event.clientX, event.clientY);
    update(null);
    if (!target) return;

    // Soltar sobre um significado já usado tira o par antigo.
    const next = Object.fromEntries(
      Object.entries(pairs).filter(([, meaning]) => meaning !== target),
    );
    next[current.word] = target;
    setPairs(next);
    if (Object.keys(next).length === words.length) onSubmit?.(JSON.stringify(next));
  };

  const numbers = new Map(Object.keys(pairs).map((word, index) => [word, index + 1]));
  const wordOf = (meaning: string) => Object.keys(pairs).find((word) => pairs[word] === meaning);
  const wordResult = (word: string) =>
    result?.matchResults?.find((pair) => pair.word === word)?.correct;

  return (
    <QuizFrame position={position} total={total}>
      <div className="flex min-h-0 flex-1 flex-col gap-[26px] px-12 py-7">
        <div className="flex flex-col gap-2.5">
          <span className="text-[11px] font-semibold tracking-[0.6px] text-white/45 uppercase">
            Associar
          </span>
          <span className="text-[24px] font-medium">Arraste cada expressão até o significado</span>
        </div>
        <div className="grid grid-cols-[1fr_60px_1fr] items-start">
          <div className="flex flex-col gap-2.5">
            {words.map((word) => {
              if (drag?.word === word) {
                // O React reaproveita o elemento da linha, que guarda a captura do ponteiro: sem
                // estes handlers, o arrasto não acompanha o mouse nem solta.
                return (
                  <div
                    key={word}
                    className="h-[50px] rounded-xl border border-dashed border-white/18"
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                  />
                );
              }
              const number = numbers.get(word);
              const look = resultClass(wordResult(word)) ?? (number ? MATCHED : NEUTRAL);
              return (
                <div
                  key={word}
                  data-testid={`match-word-${word}`}
                  className={`${ROW} ${WORD} ${look} touch-none`}
                  onPointerDown={(event) => onPointerDown(word, event)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                >
                  {word}
                  {number && <span className="text-[11px] text-accent">{number}</span>}
                </div>
              );
            })}
          </div>
          <div />
          <div className="flex flex-col gap-2.5">
            {meanings.map((meaning) => {
              const word = wordOf(meaning);
              const number = word ? numbers.get(word) : undefined;
              const hovering = drag?.over === meaning;
              const look =
                (word ? resultClass(wordResult(word)) : null) ??
                (hovering
                  ? 'border-[1.5px]! border-white/50 bg-white/10'
                  : number
                    ? `${MATCHED} text-accent`
                    : NEUTRAL);
              return (
                <div key={meaning} data-meaning={meaning} className={`${ROW} ${MEANING} ${look}`}>
                  {meaning}
                  {number && !hovering && <span className="text-[11px]">{number}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {result && (
        <div className="flex flex-none items-end px-12 pb-6">
          <Verdict result={result} onNext={onNext} />
        </div>
      )}
      {drag && (
        <div
          className={`pointer-events-none fixed box-content flex h-[50px] items-center rounded-xl border border-white/25 bg-[#3a3a40] px-4 ${WORD} shadow-[0_16px_36px_rgba(0,0,0,0.5)]`}
          style={{ left: drag.x, top: drag.y, transform: 'rotate(-2deg)' }}
        >
          {drag.word}
        </div>
      )}
    </QuizFrame>
  );
}
