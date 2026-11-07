import type { Corner, WordCard } from '@legendary/contracts';
import { AnimatePresence, motion } from 'motion/react';
import { CompactCard, FullCard, type CardActions } from './WordCardView';

/**
 * Opacidade de cada posição, do card em destaque ao resumo mais antigo. Os três primeiros valores
 * são do frame 1a, que desenha 3 cards. Os dois últimos continuam a mesma descida.
 */
const OPACITY_BY_RANK = [1, 0.78, 0.48, 0.38, 0.3];
const LOWEST_OPACITY = 0.3;

const CORNER_CLASS: Record<Corner, string> = {
  tr: 'top-5 right-5',
  tl: 'top-5 left-5',
  br: 'right-5 bottom-5 flex-col-reverse',
  bl: 'bottom-5 left-5 flex-col-reverse',
};

export interface CardStackProps extends CardActions {
  cards: WordCard[];
  corner: Corner;
  /** Se o card mais novo ainda está em destaque. Depois de um tempo ele também vira resumo. */
  focused: boolean;
  hovered: string | null;
  onHover?: (lemma: string | null) => void;
}

/** Pilha com o card mais novo em destaque e os anteriores resumidos abaixo dele. */
export function CardStack({
  cards,
  corner,
  focused,
  hovered,
  onHover,
  onKnown,
  onSave,
}: CardStackProps) {
  const fromRight = corner[1] === 'r';
  return (
    <div className={`absolute flex w-[300px] flex-col gap-2 text-white ${CORNER_CLASS[corner]}`}>
      <AnimatePresence initial={false} mode="popLayout">
        {cards.map((card, position) => {
          const isHovered = hovered === card.lemma;
          const expanded = (position === 0 && focused) || isHovered;
          const opacity = OPACITY_BY_RANK[focused ? position : position + 1] ?? LOWEST_OPACITY;
          return (
            <motion.div
              key={card.lemma}
              layout
              data-interactive
              data-testid={`card-${card.lemma}`}
              initial={{ opacity: 0, x: fromRight ? 24 : -24 }}
              animate={{ opacity: isHovered ? 1 : opacity, x: 0 }}
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
