/**
 * One card of the family page (step 5.5b; ADR-037): a reaction in one group, drawn as a textbook scheme. Per outcome one row:
 * substrate -> arrow -> products, the arrow text above and below the arrow, each product's selectivity word under it. Outcomes of the
 * same reaction that land in other groups are counted and linked ("Also gives -> Alkenes (443 K)"); nothing is hidden. The card shows what the
 * study says and decides nothing. The name is a button (the keyboard way to select the reaction); a click anywhere on the card
 * selects it too.
 */
import { Fragment, memo, useId } from 'react';
import type { FamilyCard, FamilyCardOutcome } from '@/core/graph';
import { FullEquationView } from './family-equation';
import { useFamilyEnv } from './family-env';
import { Structure } from './family-structure';
import { ArrowSide, sideText } from './family-text';
import styles from './family-page.module.css';

const REVIEW_MARK: Readonly<Record<FamilyCard['reviewStatus'], string | undefined>> = {
  verified: undefined,
  review_required: 'Review required',
  unreviewed: 'Not yet reviewed',
};

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

function Arrow(props: { readonly outcome: FamilyCardOutcome }) {
  const { above, below } = props.outcome.arrowText;
  return (
    <div className={styles.arrow} data-arrow="">
      <div className={styles.arrowAbove}>{above.length === 0 ? null : <ArrowSide parts={above} />}</div>
      <svg className={styles.arrowLine} width="96" height="10" viewBox="0 0 96 10" aria-hidden="true" focusable="false">
        <path d="M0 5 H92 M85 1 L93 5 L85 9" />
      </svg>
      <div className={styles.arrowBelow}>{below.length === 0 ? null : <ArrowSide parts={below} />}</div>
    </div>
  );
}

function OutcomeRow(props: { readonly card: FamilyCard; readonly outcome: FamilyCardOutcome }) {
  const env = useFamilyEnv();
  const { card, outcome } = props;
  const substrate = env.describe(card.substrate)?.name ?? card.substrate.id;
  const products = outcome.products.map((p) => env.describe(p.ref)?.name ?? p.ref.id);
  const conditions = [sideText(outcome.arrowText.above), sideText(outcome.arrowText.below)].filter((text) => text !== '');
  const name = `${substrate} to ${products.join(' and ')}${conditions.length === 0 ? '' : `, ${conditions.join('; ')}`}`;
  return (
    <>
    <div className={styles.scheme} role="group" aria-label={name} data-outcome-id={outcome.outcomeId}>
      <Structure substance={card.substrate} />
      <Arrow outcome={outcome} />
      <div className={styles.products}>
        {outcome.products.map((product, index) => (
          <Fragment key={product.productId}>
            {index > 0 ? <span className={styles.plus} aria-hidden="true">+</span> : null}
            <Structure substance={product.ref} {...(product.selectivity === null ? {} : { caption: product.selectivity })} />
          </Fragment>
        ))}
      </div>
    </div>
    {outcome.equation === undefined ? null : <FullEquationView equation={outcome.equation} />}
    </>
  );
}

export interface FamilyCardProps {
  readonly card: FamilyCard;
  readonly selected: boolean;
  readonly onSelect: (reactionId: string) => void;
  /** Bring the reader to the same reaction's card in another group. */
  readonly onGoToGroup: (hubId: string, reactionId: string) => void;
  /** Set when the reaction is outside the chosen exam scope: the words ("outside JEE Main"). The scheme is dimmed, the words are not. */
  readonly outside?: string;
}

export const FamilyCardView = memo(function FamilyCardView({ card, selected, onSelect, onGoToGroup, outside }: FamilyCardProps) {
  const titleId = useId();
  const review = REVIEW_MARK[card.reviewStatus];
  return (
    <article className={styles.card} aria-labelledby={titleId} data-reaction-id={card.reactionId} data-selected={selected ? '' : undefined} data-outside={outside === undefined ? undefined : ''} onClick={() => onSelect(card.reactionId)}>
      <header className={styles.cardHeader}>
        <h4 id={titleId} className={styles.cardTitle}>
          <button type="button" aria-pressed={selected} onClick={(event) => (event.stopPropagation(), onSelect(card.reactionId))}>
            {card.name}
          </button>
        </h4>
        {selected ? <span className={styles.chip}>Selected</span> : null}
        {outside === undefined ? null : <span className={`${styles.chip} ${styles.outsideChip}`}>{outside}</span>}
        {card.namedReactions.map((named) => (
          <span key={named.id} className={styles.chip}>
            {named.name}
          </span>
        ))}
        {review === undefined ? null : <span className={`${styles.chip} ${styles.reviewChip}`}>{review}</span>}
        {card.caveatCount === 0 ? null : <span className={styles.chip}>{plural(card.caveatCount, 'caveat', 'caveats')}</span>}
      </header>
      <div className={outside === undefined ? undefined : styles.dimmedScheme}>
        {card.outcomes.map((outcome) => (
          <OutcomeRow key={outcome.outcomeId} card={card} outcome={outcome} />
        ))}
      </div>
      {card.elsewhere.length === 0 ? null : (
        <p className={styles.elsewhere}>
          {card.elsewhere.map((place, index) => (
            <Fragment key={place.hubId}>
              {index > 0 ? ' ' : null}
              <button type="button" className={styles.link} onClick={(event) => (event.stopPropagation(), onGoToGroup(place.hubId, card.reactionId))}>
                {`Also gives -> ${place.name}${place.conditionText === '' ? '' : ` (${place.conditionText})`}`}
              </button>
            </Fragment>
          ))}
        </p>
      )}
    </article>
  );
});
