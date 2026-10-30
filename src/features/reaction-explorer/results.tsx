/**
 * The results of the Reactions view (step 7.1b D3): Cards (the card host the app injects) or Compact (one row: name, the equation in text,
 * the type names, the outside mark in words), 30 at a time with the truncation said in words. A reaction with no card shows its compact row
 * with the reason. A click or Enter on a row selects the reaction.
 */
import type { ReactNode } from 'react';
import { reactionCard } from '@/core/graph';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { ExampleFold, ReactionFilterRow } from '@/core/graph';
import type { CanonicalState } from '@/core/schema';
import type { ExplorerView } from '@/ui/state';
import { PAGE_SIZE, type ExplorerPorts } from './contracts';
import { compactEquationOf, type Labels } from './model';
import styles from './reactions-view.module.css';

const unscoped = (): 'unmapped' => 'unmapped';

function CompactRow(props: { readonly examples?: ReactNode; readonly exampleCount?: number; readonly exampleOf?: { readonly id: string; readonly name: string }; readonly row: ReactionFilterRow; readonly equation: string; readonly reason?: string; readonly labels: Labels; readonly selected: boolean; readonly outside: string | undefined; readonly onSelect: (id: string) => void }) {
  const { row } = props;
  const types = row.typeIds.map(props.labels.type).join(', ');
  return (
    <li className={styles.compactRow} data-reaction-id={row.id} data-selected={props.selected ? '' : undefined} data-outside={props.outside === undefined ? undefined : ''}>
      <button type="button" className={styles.compactName} aria-pressed={props.selected} onClick={() => props.onSelect(row.id)}>
        {row.name}
      </button>
      {props.equation === '' ? null : <span className={styles.compactEquation}>{props.equation}</span>}
      {types === '' ? null : <span className={styles.compactTypes}>{types}</span>}
      {props.outside === undefined ? null : <span className={styles.outsideMark}>{props.outside}</span>}
      {props.reason === undefined ? null : <span className={styles.muted}>{props.reason}</span>}
      {props.exampleOf === undefined ? null : <span className={styles.muted}>{`Example of ${props.exampleOf.name}`}</span>}
      {props.examples === undefined ? null : (
        <details className={styles.compactExamples} onClick={(event) => event.stopPropagation()}>
          <summary>{`${props.exampleCount} ${props.exampleCount === 1 ? 'example' : 'examples'}`}</summary>
          <ul className={styles.list}>{props.examples}</ul>
        </details>
      )}
    </li>
  );
}

export function Results(props: {
  readonly ports: ExplorerPorts;
  readonly state: CanonicalState;
  readonly indexes: ReadonlyIndexes;
  /** The rows that are cards: an example folded under its general reaction is not one (7.3a C1). */
  readonly rows: readonly ReactionFilterRow[];
  /** Every row of the result, folded or not, and which fold what. */
  readonly allRows: readonly ReactionFilterRow[];
  readonly folding: ExampleFold;
  readonly total: number;
  readonly view: ExplorerView;
  readonly limit: number;
  readonly labels: Labels;
  readonly selected: string | null;
  readonly outsideNote: string | undefined;
  readonly onMore: () => void;
}) {
  const { ports, rows } = props;
  const shown = rows.slice(0, props.limit);
  const outsideOf = (row: ReactionFilterRow): string | undefined => (row.outside ? props.outsideNote : undefined);
  const byId = new Map(props.allRows.map((row) => [row.id, row]));
  const outsideById = (id: string): string | undefined => outsideOf(byId.get(id) as ReactionFilterRow);
  const generalOf = (id: string): { readonly id: string; readonly name: string } | undefined => {
    const general = props.folding.exampleOf.get(id);
    return general === undefined ? undefined : { id: general, name: props.state.records.reaction[general as never]?.name ?? general };
  };
  const compactOf = (row: ReactionFilterRow, reason?: string, nested = false) => {
    const card = reactionCard({ state: props.state, indexes: props.indexes, scopeOf: unscoped }, row.id);
    const equation = 'missing' in card ? '' : compactEquationOf(card.groups);
    const mine = nested ? [] : (props.folding.examplesOf.get(row.id) ?? []);
    const general = nested ? undefined : generalOf(row.id);
    return <CompactRow key={row.id} row={row} equation={equation} labels={props.labels} selected={props.selected === row.id} outside={outsideOf(row)} onSelect={ports.select} {...(mine.length === 0 ? {} : { exampleCount: mine.length, examples: mine.map((id) => compactOf(byId.get(id) as ReactionFilterRow, undefined, true)) })} {...(general === undefined ? {} : { exampleOf: general })} {...(reason === undefined ? {} : { reason })} />;
  };
  return (
    <div className={styles.results}>
      <ul className={styles.list} aria-label="Reactions">
        {shown.map((row) =>
          props.view === 'compact' ? (
            compactOf(row)
          ) : (
            <li key={row.id} className={styles.cardItem}>
              {ports.renderCard({ reactionId: row.id, selected: props.selected === row.id, onSelect: ports.select, ...(outsideOf(row) === undefined ? {} : { outside: outsideOf(row) as string }), ...((props.folding.examplesOf.get(row.id) ?? []).length === 0 ? {} : { examples: props.folding.examplesOf.get(row.id) as readonly string[], selectedId: props.selected, outsideOf: outsideById }), ...(generalOf(row.id) === undefined ? {} : { exampleOf: generalOf(row.id) as { readonly id: string; readonly name: string } }), fallback: (reason) => <ul className={styles.fallback}>{compactOf(row, reason)}</ul> })}
            </li>
          ),
        )}
      </ul>
      {rows.length > shown.length ? (
        <div className={styles.more}>
          <p className={styles.muted}>{`Showing ${shown.length} of ${rows.length}`}</p>
          <button type="button" onClick={props.onMore}>{`Show ${PAGE_SIZE} more`}</button>
        </div>
      ) : null}
    </div>
  );
}
