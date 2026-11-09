import { useEffect } from 'react';
import { api } from '../shared/api';
import { TrafficLights } from '../shared/TrafficLights';
import { FinalView } from './FinalView';
import { MatchView } from './MatchView';
import { NoWordsView } from './NoWordsView';
import { choicesOf, QuestionView } from './QuestionView';
import { useQuiz } from './store';
import { SummaryView } from './SummaryView';
import { TriageView } from './TriageView';

const params = new URLSearchParams(location.search);
const sessionId = Number(params.get('sessionId'));
const triage = params.has('triage');

type QuizStore = ReturnType<typeof useQuiz.getState>;

/** As teclas da triagem, como no frame 2a. */
const TRIAGE_KEYS: Record<string, (state: QuizStore) => void> = {
  ArrowUp: (state) => state.knowWord(),
  ArrowDown: (state) => state.skipWord(),
  ArrowLeft: (state) => state.backWord(),
  Enter: (state) => void state.finishTriage(),
};

const closeWindow = () => void api().invoke('window:close-current');

function Message({ text }: { text: string }) {
  return (
    <div className="flex h-full flex-col bg-surface text-[13px] text-white">
      <div className="drag flex h-[38px] flex-none items-center px-3.5">
        <TrafficLights />
      </div>
      <div className="flex flex-1 items-center justify-center text-white/60">{text}</div>
    </div>
  );
}

export function App() {
  const state = useQuiz();
  const question = state.quiz?.questions[state.index];

  useEffect(() => {
    void useQuiz.getState().load(sessionId, triage);
  }, []);

  // Teclas 1 a 4 respondem, e Enter avança ou começa o quiz, como no frame 1g.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement && !event.target.disabled) return;
      const current = useQuiz.getState();
      if (current.phase === 'triage') {
        const action = TRIAGE_KEYS[event.key];
        if (!action) return;
        event.preventDefault();
        // Segurar a tecla repete o toque, e isso marcaria palavras que a pessoa nem chegou a ver.
        if (!event.repeat) action(current);
        return;
      }
      if (current.phase === 'empty' && event.key === 'Enter') {
        event.preventDefault();
        closeWindow();
        return;
      }
      if (event.key === 'Enter') {
        if (current.phase === 'summary') void current.start();
        else if (current.phase === 'question') void current.next();
        else return;
        event.preventDefault();
        return;
      }
      const active = current.quiz?.questions[current.index];
      if (current.phase !== 'question' || !active || current.result) return;
      const choice = choicesOf(active)?.[Number(event.key) - 1];
      if (choice) void current.answer(choice.value);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (state.phase === 'loading') return <Message text="Carregando…" />;
  if (state.phase === 'error') return <Message text="Não deu para abrir este quiz." />;
  if (state.phase === 'empty') return <NoWordsView onClose={closeWindow} />;

  const triageWord = state.phase === 'triage' ? state.triage[state.triageIndex] : undefined;
  if (triageWord) {
    return (
      <TriageView
        word={triageWord}
        position={state.triageIndex + 1}
        total={state.triage.length}
        onKnown={state.knowWord}
        onUnknown={state.skipWord}
        onBack={state.backWord}
        onSkip={() => void state.finishTriage()}
      />
    );
  }

  if (state.phase === 'summary' && state.summary) {
    return (
      <SummaryView
        summary={state.summary}
        excluded={state.excluded}
        preparing={state.preparing}
        onToggle={state.toggleWord}
        onStart={() => void state.start()}
      />
    );
  }

  if (state.phase === 'final' && state.final) {
    return (
      <FinalView
        result={state.final}
        onHistory={() => void api().invoke('window:open', { window: 'history' })}
        onClose={closeWindow}
        onReview={() => void state.reviewMistakes()}
      />
    );
  }

  if (!question || !state.quiz) return <Message text="Não deu para abrir este quiz." />;

  const shared = {
    position: state.index + 1,
    total: state.quiz.questions.length,
    result: state.result,
    onNext: () => void state.next(),
  };
  return question.type === 'match' ? (
    <MatchView
      key={question.id}
      question={question}
      {...shared}
      onSubmit={(answer) => void state.answer(answer)}
    />
  ) : (
    <QuestionView
      key={question.id}
      question={question}
      {...shared}
      picked={state.picked}
      onAnswer={(value) => void state.answer(value)}
    />
  );
}
