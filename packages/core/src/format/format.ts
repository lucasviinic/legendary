import type { QuestionType } from '@legendary/contracts';

const pad = (value: number) => String(value).padStart(2, '0');

/** Tempo da sessão, como "24:12". */
export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function formatDuration(ms: number): string {
  return `${Math.max(1, Math.round(ms / 60_000))} min`;
}

function calendarDays(from: number, to: number): number {
  const start = new Date(from).setHours(0, 0, 0, 0);
  const end = new Date(to).setHours(0, 0, 0, 0);
  return Math.round((end - start) / 86_400_000);
}

export function formatNextReview(dueAt: number | null, now: number): string {
  if (dueAt === null) return 'Após o quiz';
  const days = calendarDays(now, dueAt);
  if (days <= 0) return 'Hoje';
  return days === 1 ? 'Amanhã' : `Em ${days} dias`;
}

export function sessionGroupLabel(startedAt: number, now: number): string {
  const days = calendarDays(startedAt, now);
  if (days <= 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  return days < 7 ? 'Esta semana' : 'Mais antigas';
}

const QUESTION_LABELS: Record<QuestionType, string> = {
  mc_en_pt: 'Múltipla escolha',
  mc_pt_en: 'Múltipla escolha',
  cloze: 'Completar lacuna',
  context_sense: 'Sentido no contexto',
  match: 'Associar',
  true_false: 'Verdadeiro ou falso',
  type_word: 'Escrever a palavra',
};

export const questionTypeLabel = (type: QuestionType): string => QUESTION_LABELS[type];

export function scoreHeadline(score: number, total: number): string {
  const ratio = total > 0 ? score / total : 0;
  if (ratio === 1) return 'Perfeito.';
  if (ratio >= 0.7) return 'Muito bom.';
  return ratio >= 0.5 ? 'Bom começo.' : 'Vale revisar.';
}
