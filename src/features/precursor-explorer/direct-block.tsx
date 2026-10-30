/**
 * "Made directly from" (step 7.2a D2): one block per starting material ("From Ethanol, 2 reactions"), each reaction a card (Cards) or a
 * compact row (Compact, the Reactions view's own toggle), outside reactions marked as on the family page, a click opens the inspector.
 */
import type { ReactNode } from 'react';
import { compactEquationOf, exampleLookupOf, foldExamples, reactionCard, type DirectPrecursors, type ProjectionContext } from '@/core/graph';
import type { ExplorerView } from '@/ui/state';
import type { PrecursorPorts } from './contracts';
import styles from './precursors-view.module.css';

const reactions = (n: number): string => (n === 1 ? '1 reaction' : `${n} reactions`);

function CompactRow(props: { readonly examples?: ReactNode; readonly exampleCount?: number; readonly exampleOf?: string; readonly reactionId: string; readonly name: string; readonly equation: string; readonly outside: string | undefined; readonly selected: boolean; readonly onSelect: (id: string) => void }) {
  return (
    <li className={styles.compactRow} data-reaction-id={props.reactionId} data-selected={props.selected ? '' : undefined} data-outside={props.outside === undefined ? undefined : ''}>
      <button type="button" className={styles.compactName} aria-pressed={props.selected} onClick={() => props.onSelect(props.reactionId)}>
        {props.name}
      </button>
      {props.equation === '' ? null : <span className={styles.compactEquation}>{props.equation}</span>}
      {props.outside === undefined ? null : <span className={styles.outsideMark}>{props.outside}</span>}
      {props.exampleOf === undefined ? null : <span className={styles.muted}>{`Example of ${props.exampleOf}`}</span>}
      {props.examples === undefined ? null : (
        <details className={styles.compactExamples} onClick={(event) => event.stopPropagation()}>
          <summary>{`${props.exampleCount} ${props.exampleCount === 1 ? 'example' : 'examples'}`}</summary>
          <ul className={styles.list}>{props.examples}</ul>
        </details>
      )}
    </li>
  );
}

export function DirectBlock(props: {
  readonly ports: Pick<PrecursorPorts, 'select' | 'renderCard' | 'showReactionsMaking'>;
  readonly ctx: ProjectionContext;
  readonly direct: DirectPrecursors;
  readonly targetName: string;
  readonly view: ExplorerView;
  readonly selected: string | null;
  readonly outsideNote: string | undefined;
}) {
  const { ports, direct } = props;
  const outsideOf = (outside: boolean): string | undefined => (outside ? props.outsideNote : undefined);
  const lookup = exampleLookupOf(props.ctx.state);
  const nameOf = (id: string): string => props.ctx.state.records.reaction[id as never]?.name ?? id;
  // the list is ONE starting material's block: an example folds under its general reaction when that card is in the block (7.3a C1, C2)
  const compact = (reactionId: string, name: string, outside: boolean, reason?: string, fold?: { readonly examples: readonly string[]; readonly of: string | undefined; readonly rowOf: (id: string) => ReactNode }) => {
    const card = reactionCard(props.ctx, reactionId);
    const equation = 'missing' in card ? '' : compactEquationOf(card.groups);
    const mine = fold?.examples ?? [];
    return (
      <CompactRow
        key={reactionId}
        reactionId={reactionId}
        name={name}
        equation={reason === undefined ? equation : reason}
        outside={outsideOf(outside)}
        selected={props.selected === reactionId}
        onSelect={ports.select}
        {...(mine.length === 0 || fold === undefined ? {} : { exampleCount: mine.length, examples: mine.map((id) => fold.rowOf(id)) })}
        {...(fold?.of === undefined ? {} : { exampleOf: nameOf(fold.of) })}
      />
    );
  };
  return (
    <section className={styles.section} aria-labelledby="direct-heading">
      <h3 id="direct-heading" className={styles.sectionTitle}>
        Made directly from
      </h3>
      {direct.target.kind === 'class' ? (
        <p className={styles.muted}>Only reactions that name this class itself are listed here. Find a route also finds reactions that make its members.</p>
      ) : null}
      {direct.groups.length === 0 ? <p className={styles.muted}>{`No reaction in the data makes ${props.targetName} directly.`}</p> : null}
      {direct.groups.map((group) => {
        const folding = foldExamples(group.reactions.map((one) => one.reactionId), lookup);
        const byId = new Map(group.reactions.map((one) => [one.reactionId as string, one]));
        const outsideById = (id: string): string | undefined => outsideOf(byId.get(id)?.outside === true);
        const rowOf = (id: string): ReactNode => compact(id, byId.get(id)?.name ?? id, byId.get(id)?.outside === true);
        const cards = folding.shown.map((id) => byId.get(id) as (typeof group.reactions)[number]);
        const examples = folding.folded === 0 ? '' : ` (+ ${folding.folded} ${folding.folded === 1 ? 'example' : 'examples'})`;
        return (
        <div key={group.key} className={styles.group}>
          <h4 className={styles.groupTitle}>{`${group.substrate === null ? group.name : `From ${group.name}`}, ${reactions(cards.length)}${examples}`}</h4>
          <ul className={styles.list} aria-label={`${group.name}: reactions`}>
            {cards.map((one) =>
              props.view === 'compact' ? (
                compact(one.reactionId, one.name, one.outside, undefined, { examples: folding.examplesOf.get(one.reactionId) ?? [], of: folding.exampleOf.get(one.reactionId), rowOf })
              ) : (
                <li key={one.reactionId} className={styles.cardItem}>
                  {ports.renderCard({
                    reactionId: one.reactionId,
                    selected: props.selected === one.reactionId,
                    onSelect: ports.select,
                    ...(outsideOf(one.outside) === undefined ? {} : { outside: outsideOf(one.outside) as string }),
                    ...((folding.examplesOf.get(one.reactionId) ?? []).length === 0 ? {} : { examples: folding.examplesOf.get(one.reactionId) as readonly string[], selectedId: props.selected, outsideOf: outsideById }),
                    ...(folding.exampleOf.get(one.reactionId) === undefined ? {} : { exampleOf: { id: folding.exampleOf.get(one.reactionId) as string, name: nameOf(folding.exampleOf.get(one.reactionId) as string) } }),
                    fallback: (reason) => <ul className={styles.fallback}>{compact(one.reactionId, one.name, one.outside, reason)}</ul>,
                  })}
                </li>
              ),
            )}
          </ul>
        </div>
        );
      })}
      {direct.byproductOnly.length === 0 ? null : (
        <p className={styles.byproduct}>
          <span>{`Also formed as a by-product in ${reactions(direct.byproductOnly.length)}`}</span>
          <button type="button" className={styles.link} onClick={() => ports.showReactionsMaking(direct.target)}>
            Show these reactions in Reactions
          </button>
        </p>
      )}
    </section>
  );
}
