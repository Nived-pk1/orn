/**
 * One card of the family page (step 5.5b; ADR-037): a reaction in one group, drawn as a textbook scheme. Per GROUP of outcomes (the
 * outcomes that share their condition-variant set) one scheme: substrate → arrow → the main products of each outcome, the arrow text above
 * and below the arrow, each product's word (selectivity, and regiochemistry) under it. A card with several groups puts each in a bordered
 * block headed by its conditions in words. On a phone the
 * scheme is drawn top to bottom (reactants in a row, a downward arrow with the reagents beside it and the conditions under them, the
 * products in a row). Outcomes of the same reaction that land in other groups are counted and linked ("Also gives → Alkenes (443 K)"); nothing is hidden. The card shows what the
 * study says and decides nothing. The name is a button (the keyboard way to select the reaction); a click anywhere on the card
 * selects it too.
 */
import { Fragment, memo, useId, type ReactNode } from 'react';
import type { ArrowText, FamilyCard, FamilyOutcomeGroup } from '@/core/graph';
import { FullEquationView } from './family-equation';
import { useFamilyEnv } from './family-env';
import { Structure } from './family-structure';
import { ArrowSide, sideText } from './family-text';
import styles from './family-page.module.css';
import scheme from './family-scheme.module.css';

const REVIEW_MARK: Readonly<Record<FamilyCard['reviewStatus'], string | undefined>> = {
  verified: undefined,
  review_required: 'Review required',
  unreviewed: 'Not yet reviewed',
};

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/**
 * The phone's arrow: a downward arrow CENTRED on the column (under the reactants), at least 48 px and as tall as the text beside it plus
 * 16 px; the reagents sit to its right, left-aligned, the conditions under them, the text block vertically centred on the arrow.
 */
function DownArrow(props: { readonly arrowText: ArrowText }) {
  const { above, below } = props.arrowText;
  return (
    <div className={scheme.downArrow} data-arrow="" data-direction="down">
      <span aria-hidden="true" />
      <div className={scheme.downArrowShaft} data-arrow-line="" aria-hidden="true">
        <span className={scheme.downArrowStem} />
        <svg className={scheme.downArrowHead} width="14" height="9" viewBox="0 0 14 9" focusable="false">
          <path d="M2 1 L7 8 L12 1" />
        </svg>
      </div>
      <div className={scheme.downArrowText} data-arrow-text="">
        <div className={scheme.arrowAbove}>{above.length === 0 ? null : <ArrowSide parts={above} />}</div>
        <div className={scheme.arrowBelow}>{below.length === 0 ? null : <ArrowSide parts={below} />}</div>
      </div>
    </div>
  );
}

function Arrow(props: { readonly arrowText: ArrowText }) {
  const { above, below } = props.arrowText;
  return (
    <div className={scheme.arrow} data-arrow="">
      <div className={scheme.arrowAbove}>{above.length === 0 ? null : <ArrowSide parts={above} />}</div>
      <svg className={scheme.arrowLine} width="96" height="10" viewBox="0 0 96 10" aria-hidden="true" focusable="false">
        <path d="M0 5 H92 M85 1 L93 5 L85 9" />
      </svg>
      <div className={scheme.arrowBelow}>{below.length === 0 ? null : <ArrowSide parts={below} />}</div>
    </div>
  );
}

/**
 * ONE scheme for a group of outcomes (outcome groups step): the carried substrate and the arrow once, then the main products of EACH
 * outcome of the group, each with its word under it. On the desktop the outcomes' products are a column right of the arrow (the major on
 * top); on a phone they are tiles side by side in a row that wraps, under the downward arrow. The full equation of the group is under it.
 */
function GroupScheme(props: { readonly card: FamilyCard; readonly group: FamilyOutcomeGroup }) {
  const env = useFamilyEnv();
  const { card, group } = props;
  const substrate = env.describe(card.substrate)?.name ?? card.substrate.id;
  const products = group.outcomes.flatMap((outcome) => outcome.products).map((p) => env.describe(p.ref)?.name ?? p.ref.id);
  const conditions = [sideText(group.arrowText.above), sideText(group.arrowText.below)].filter((text) => text !== '');
  const name = `${substrate} to ${products.join(' and ')}${conditions.length === 0 ? '' : `, ${conditions.join('; ')}`}`;
  return (
    <>
      <div className={scheme.scheme} role="group" aria-label={name} data-outcome-ids={group.outcomes.map((outcome) => outcome.outcomeId).join(' ')}>
        {env.layout === 'phone' ? (
          <div className={scheme.reactants}>
            <Structure substance={card.substrate} {...(card.substrateWrittenAs === undefined ? {} : { writtenAs: card.substrateWrittenAs })} />
          </div>
        ) : (
          <Structure substance={card.substrate} {...(card.substrateWrittenAs === undefined ? {} : { writtenAs: card.substrateWrittenAs })} />
        )}
        {env.layout === 'phone' ? <DownArrow arrowText={group.arrowText} /> : <Arrow arrowText={group.arrowText} />}
        <div className={scheme.products}>
          {group.outcomes.map((outcome) => (
            <div key={outcome.outcomeId} className={scheme.outcomeProducts} data-outcome-id={outcome.outcomeId}>
              {outcome.products.map((product, index) => (
                <Fragment key={product.productId}>
                  {index > 0 ? <span className={scheme.plus} aria-hidden="true">+</span> : null}
                  <Structure substance={product.ref} {...(outcome.word === null ? {} : { caption: outcome.word })} {...(product.writtenAs === undefined ? {} : { writtenAs: product.writtenAs })} />
                </Fragment>
              ))}
            </div>
          ))}
        </div>
      </div>
      {group.equation === undefined ? null : <FullEquationView equation={group.equation} />}
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
  /** The outside words of an example folded under this card (7.3a C5); undefined for one that is inside the scope or when no scope is chosen. */
  readonly outsideOf?: (reactionId: string) => string | undefined;
  /** The selected reaction, so an example inside the disclosure shows it is selected. */
  readonly selectedId?: string | null;
  /** An example drawn inside its general reaction's disclosure: its title is one level down. */
  readonly nested?: boolean;
}

export const FamilyCardView = memo(function FamilyCardView({ card, selected, onSelect, onGoToGroup, outside, outsideOf, selectedId, nested }: FamilyCardProps) {
  const titleId = useId();
  const review = REVIEW_MARK[card.reviewStatus];
  return (
    <article className={styles.card} aria-labelledby={titleId} data-reaction-id={card.reactionId} data-selected={selected ? '' : undefined} data-outside={outside === undefined ? undefined : ''} onClick={() => onSelect(card.reactionId)}>
      <header className={styles.cardHeader}>
        <Title id={titleId} nested={nested === true} className={styles.cardTitle}>
          <button type="button" aria-pressed={selected} onClick={(event) => (event.stopPropagation(), onSelect(card.reactionId))}>
            {card.name}
          </button>
        </Title>
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
      {card.exampleOf === undefined ? null : (
        <p className={styles.exampleOf}>
          {'Example of '}
          <button type="button" className={styles.link} onClick={(event) => (event.stopPropagation(), onSelect(card.exampleOf?.reactionId ?? ''))}>
            {card.exampleOf.name}
          </button>
        </p>
      )}
      <div className={outside === undefined ? undefined : styles.dimmedScheme}>
        {card.groups.length === 1 ? (
          card.groups.map((group) => <GroupScheme key={group.key} card={card} group={group} />)
        ) : (
          card.groups.map((group) => (
            <section key={group.key} className={styles.groupBlock} aria-label={group.heading} data-outcome-group={group.key}>
              <h5 className={styles.groupHeading}>{group.heading}</h5>
              <GroupScheme card={card} group={group} />
            </section>
          ))
        )}
      </div>
      {card.elsewhere.length === 0 ? null : (
        <p className={styles.elsewhere}>
          {card.elsewhere.map((place, index) => (
            <Fragment key={place.hubId}>
              {index > 0 ? ' ' : null}
              <button type="button" className={styles.link} onClick={(event) => (event.stopPropagation(), onGoToGroup(place.hubId, card.reactionId))}>
                {`Also gives → ${place.name}${place.conditionText === '' ? '' : ` (${place.conditionText})`}`}
              </button>
            </Fragment>
          ))}
        </p>
      )}
      {(card.examples ?? []).length === 0 ? null : (
        <details className={styles.examples} data-examples="" onClick={(event) => event.stopPropagation()}>
          <summary>{`Examples (${card.examples?.length ?? 0})`}</summary>
          {(card.examples ?? []).map((example) => {
            const words = outsideOf?.(example.reactionId);
            return <FamilyCardView key={example.key} card={example} nested selected={selectedId === example.reactionId} onSelect={onSelect} onGoToGroup={onGoToGroup} {...(words === undefined ? {} : { outside: words })} {...(selectedId === undefined ? {} : { selectedId })} />;
          })}
        </details>
      )}
    </article>
  );
});

/** The card's title: an h4 on its own, an h5 inside a general reaction's "Examples" (7.3a C1). */
function Title(props: { readonly id: string; readonly nested: boolean; readonly className: string | undefined; readonly children: ReactNode }) {
  return props.nested ? (
    <h5 id={props.id} className={props.className}>
      {props.children}
    </h5>
  ) : (
    <h4 id={props.id} className={props.className}>
      {props.children}
    </h4>
  );
}
