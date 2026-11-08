import type { WordCard } from '@legendary/contracts';
import { Glass } from '../shared/Glass';

function levelLabel(card: WordCard) {
  return card.cefr ? `${card.cefr} · ${card.pos}` : card.pos;
}

function Sentence({
  sentence,
  surface,
  thick,
}: {
  sentence: string;
  surface: string;
  thick: boolean;
}) {
  const start = sentence.toLowerCase().indexOf(surface.toLowerCase());
  if (start < 0) return <>“{sentence}”</>;
  const end = start + surface.length;
  return (
    <>
      “{sentence.slice(0, start)}
      <span
        className={`underline decoration-accent underline-offset-[3px] ${thick ? 'decoration-[1.5px]' : ''}`}
      >
        {sentence.slice(start, end)}
      </span>
      {sentence.slice(end)}”
    </>
  );
}

function Header({ card, tight }: { card: WordCard; tight: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={`text-[20px] font-semibold ${tight ? 'tracking-[-0.2px]' : ''}`}>
        {card.lemma}
      </span>
      <span className="rounded-md border border-white/18 px-1.5 py-0.5 text-[10.5px] whitespace-nowrap text-white/62">
        {levelLabel(card)}
      </span>
    </div>
  );
}

export interface CardActions {
  onKnown?: (lemma: string) => void;
  onUnmarkKnown?: (lemma: string) => void;
  onSave?: (lemma: string) => void;
}

const BUTTON = 'flex h-[26px] items-center rounded-lg px-2.5 text-[12px] font-medium';

/** Card em destaque (frame 1a) e card aberto pelo hover (frame 1c), quando `hovered` é verdadeiro. */
export function FullCard({
  card,
  hovered,
  onKnown,
  onUnmarkKnown,
  onSave,
}: { card: WordCard; hovered: boolean } & CardActions) {
  // Frame 1c. A tradução chega antes do resto da resposta e ocupa o lugar da primeira barra.
  if (card.explanation === null) {
    return (
      <Glass className="flex flex-col gap-[9px] rounded-[14px] px-4 py-3.5">
        <Header card={card} tight={false} />
        {card.translation === null ? (
          <span className="h-3 w-[120px] rounded-md bg-accent/22" />
        ) : (
          <div className="text-[15px] font-medium text-accent">{card.translation}</div>
        )}
        <span className="box-border h-[9px] w-full rounded-[5px] bg-white/10" />
        <span className="box-border h-[9px] w-[70%] rounded-[5px] bg-white/10" />
      </Glass>
    );
  }

  const surface = hovered
    ? 'border-white/22! shadow-[0_14px_40px_rgba(0,0,0,0.35)] [--glass-bg:rgba(30,30,34,0.66)]'
    : 'shadow-[0_10px_30px_rgba(0,0,0,0.28)]';

  return (
    <Glass className={`flex flex-col gap-1.5 rounded-[14px] px-4 pt-3.5 pb-3 ${surface}`}>
      <Header card={card} tight={!hovered} />
      <div className="text-[15px] font-medium text-accent">{card.translation}</div>
      <div className={`text-[12.5px] leading-[1.45] text-white/72 ${hovered ? '' : 'text-pretty'}`}>
        {card.explanation}
      </div>
      <div className="mt-1 border-t border-white/8 pt-[9px] text-[12.5px] leading-[1.45] text-white/88 italic">
        <Sentence sentence={card.sentence} surface={card.surface} thick={!hovered} />
      </div>
      {hovered && card.extraExample && (
        <div className="flex flex-col gap-[3px] rounded-[9px] bg-white/6 px-2.5 py-2">
          <span className="text-[10px] font-semibold tracking-[0.5px] text-white/45 uppercase">
            Outro exemplo
          </span>
          <span className="text-[12.5px] leading-[1.45] text-white/85">{card.extraExample}</span>
        </div>
      )}
      <div className={`flex items-center gap-1.5 ${hovered ? 'mt-1' : 'mt-1.5'}`}>
        <button
          onClick={() => (card.known ? onUnmarkKnown : onKnown)?.(card.lemma)}
          className={`${BUTTON} ${card.known ? 'bg-white/16' : 'bg-white/10'} hover:bg-white/18`}
        >
          {card.known ? 'Já sei ✓' : 'Já sei'}
        </button>
        <button
          onClick={() => onSave?.(card.lemma)}
          className={`${BUTTON} ${card.saved ? 'bg-white/16' : 'bg-white/10'} hover:bg-white/18`}
        >
          {card.saved ? 'Salvo ✓' : 'Salvar'}
        </button>
        <span className="ml-auto text-[11px] text-white/45 tabular-nums">
          ×{card.count} na sessão
        </span>
      </div>
    </Glass>
  );
}

/** Card anterior, encolhido para a palavra e a tradução. O contador não está no mockup. */
export function CompactCard({ card }: { card: WordCard }) {
  return (
    <Glass className="flex items-baseline gap-2.5 rounded-[14px] px-3.5 py-[9px]">
      <span className="text-[14px] font-semibold">{card.lemma}</span>
      <span className="text-[13px] text-accent">{card.translation ?? '…'}</span>
      {card.count > 1 && (
        <span className="ml-auto flex-none text-[11px] text-white/45 tabular-nums">
          {card.count}x
        </span>
      )}
    </Glass>
  );
}
