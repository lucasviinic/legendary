import type { Corner, WordCard } from '@legendary/contracts';
import { AnimatePresence, motion } from 'motion/react';
import { CompactCard, FullCard, type CardActions } from './WordCardView';

/** Opacidade de cada posição na pilha, do card mais novo ao mais antigo (frame 1a). */
const OPACITY_BY_POSITION = [1, 0.78, 0.48];

const CORNER_CLASS: Record<Corner, string> = {
  tr: 'top-5 right-5',
  tl: 'top-5 left-5',
  br: 'right-5 bottom-5 flex-col-reverse',
  bl: 'bottom-5 left-5 flex-col-reverse',
};

export interface CardStackProps extends CardActions {
  cards: WordCard[];
  corner: Corner;
  hovered: string | null;
  onHover?: (lemma: string | null) => void;
}

/** Pilha de até 3 cards, com o mais novo em destaque. */
export function CardStack({ cards, corner, hovered, onHover, onKnown, onSave }: CardStackProps) {
  const fromRight = corner[1] === 'r';
  return (
    <div className={`absolute flex w-[300px] flex-col gap-2 text-white ${CORNER_CLASS[corner]}`}>
      <AnimatePresence initial={false} mode="popLayout">
        {cards.map((card, position) => {
          const isHovered = hovered === card.lemma;
          const expanded = position === 0 || isHovered;
          return (
            <motion.div
              key={card.lemma}
              layout
              data-interactive
              data-testid={`card-${card.lemma}`}
              initial={{ opacity: 0, x: fromRight ? 24 : -24 }}
              animate={{ opacity: isHovered ? 1 : (OPACITY_BY_POSITION[position] ?? 0.48), x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onMouseEnter={() => onHover?.(card.lemma)}
              onMouseLeave={() => onHover?.(null)}
            >
              {expanded ? (
                <FullCard card={card} hovered={isHovered} onKnown={onKnown} onSave={onSave} />
              ) : (
                <CompactCard card={card} />
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
