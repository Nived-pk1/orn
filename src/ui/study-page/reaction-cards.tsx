/**
 * The reactions section of a Named reactions or Mechanisms page (7.4 D, E): each reaction's own family card (handed in), the examples folded
 * under their general reaction, 30 cards at a time, the exam scope marking ("outside JEE Main") or hiding ("Only <exam version>") the reactions
 * it leaves out and saying how many. The cards are drawn by the other features' renderer; this file draws no chemistry.
 */
import { useState, type ReactNode } from 'react';
import { plural, verbFor } from '@/core/text';
import styles from './study-page.module.css';

export const CARDS_PAGE_SIZE = 30;

export interface CardArgs {
  readonly reactionId: string;
  readonly selected: boolean;
  readonly onSelect: (reactionId: string) => void;
  /** "outside JEE Main" when the reaction is outside the chosen exam scope. */
  readonly outside?: string;
  /** The ids of this general reaction's examples that fold under its card. */
  readonly examples?: readonly string[];
  readonly selectedId?: string | null;
  readonly outsideOf?: (reactionId: string) => string | undefined;
  readonly fallback: (reason: string) => ReactNode;
}

export interface ReactionCardsProps {
  readonly reactions: readonly string[];
  readonly examplesOf: ReadonlyMap<string, readonly string[]>;
  /** "outside <exam>" for a reaction outside the chosen scope; undefined otherwise. */
  readonly outsideOf: (reactionId: string) => string | undefined;
  readonly onlyInScope: boolean;
  readonly selectedId: string | null;
  readonly renderCard: (args: CardArgs) => ReactNode;
  readonly onSelect: (reactionId: string) => void;
  readonly emptyWords: string;
}

export function ReactionCards(props: ReactionCardsProps) {
  const { onlyInScope, outsideOf } = props;
  const [limit, setLimit] = useState(CARDS_PAGE_SIZE);
  const kept = onlyInScope ? props.reactions.filter((id) => outsideOf(id) === undefined) : props.reactions;
  const left = props.reactions.length - kept.length;
  const shown = kept.slice(0, limit);
  return (
    <div className={styles.cards}>
      {props.reactions.length === 0 ? <p className={styles.muted}>{props.emptyWords}</p> : null}
      {left > 0 ? <p className={styles.muted}>{`${plural(left, 'reaction', 'reactions')} ${verbFor(left, 'is', 'are')} left out by the exam scope.`}</p> : null}
      <ul className={styles.cardList}>
        {shown.map((id) => {
          const examples = (props.examplesOf.get(id) ?? []).filter((one) => !onlyInScope || outsideOf(one) === undefined);
          const outside = outsideOf(id);
          return (
            <li key={id} className={styles.cardItem} data-reaction-id={id}>
              {props.renderCard({
                reactionId: id,
                selected: props.selectedId === id,
                onSelect: props.onSelect,
                ...(outside === undefined ? {} : { outside }),
                ...(examples.length === 0 ? {} : { examples, selectedId: props.selectedId, outsideOf }),
                fallback: (reason) => <p className={styles.muted}>{`${id}: ${reason}`}</p>,
              })}
            </li>
          );
        })}
      </ul>
      {kept.length > shown.length ? (
        <div className={styles.more}>
          <p className={styles.muted} role="status">{`Showing ${shown.length} of ${plural(kept.length, 'reaction', 'reactions')}`}</p>
          <button type="button" onClick={() => setLimit((n) => n + CARDS_PAGE_SIZE)}>{`Show ${CARDS_PAGE_SIZE} more`}</button>
        </div>
      ) : null}
    </div>
  );
}
