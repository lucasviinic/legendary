import type { CardPlacement, WordCard } from '@legendary/contracts';
import { AnimatePresence, motion } from 'motion/react';
import { useStackDrag } from './useStackDrag';
import { CompactCard, FullCard, type CardActions } from './WordCardView';

/**
 * Opacidade de cada posição, do card em destaque ao resumo mais antigo. Os três primeiros valores
 * são do frame 1a, que desenha 3 cards. Os outros descem devagar para o texto continuar legível.
 */
const OPACITY_BY_RANK = [1, 0.78, 0.48, 0.43, 0.39, 0.34, 0.3];
const LOWEST_OPACITY = 0.3;

export interface CardStackProps extends CardActions {
  cards: WordCard[];
  placement: CardPlacement;
  /** Quantos dos primeiros cards estão abertos. Depois de um tempo eles também viram resumo. */
  openCards: number;
  hovered: string | null;
  onHover?: (lemma: string | null) => void;
  /** Sem esta função, a pilha não pode ser arrastada. */
  onPlace?: (placement: CardPlacement) => void;
  onDragging?: (dragging: boolean) => void;
}

/** Pilha com o card mais novo em destaque e os anteriores resumidos abaixo dele. */
export function CardStack({
  cards,
  placement,
  openCards,
  hovered,
  onHover,
  onKnown,
  onSave,
  onPlace,
  onDragging,
}: CardStackProps) {
  const drag = useStackDrag({ placement, onPlace, onDragging });
  const fromRight = placement.corner[1] === 'r';
  const fromBottom = placement.corner[0] === 'b';
  return (
    <div
      {...drag}
      data-testid="card-stack"
      className={`absolute flex w-[300px] gap-2 text-white ${fromBottom ? 'flex-col-reverse' : 'flex-col'} ${onPlace ? 'cursor-grab active:cursor-grabbing [&_button]:cursor-default' : ''}`}
      style={{
        [fromBottom ? 'bottom' : 'top']: placement.y,
        [fromRight ? 'right' : 'left']: placement.x,
      }}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {cards.map((card, position) => {
          const isHovered = hovered === card.lemma;
          const open = position < openCards;
          const expanded = open || isHovered;
          const rank = open ? 0 : position - openCards + 1;
          const opacity = OPACITY_BY_RANK[rank] ?? LOWEST_OPACITY;
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
