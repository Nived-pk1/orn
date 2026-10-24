/**
 * The results of the Reactions view (step 7.1b D3): Cards (the card host the app injects) or Compact (one row: name, the equation in text,
 * the type names, the outside mark in words), 30 at a time with the truncation said in words. A reaction with no card shows its compact row
 * with the reason. A click or Enter on a row selects the reaction.
 */
import { reactionCard } from '@/core/graph';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { ReactionFilterRow } from '@/core/graph';
import type { CanonicalState } from '@/core/schema';
import type { ExplorerView } from '@/ui/state';
import { PAGE_SIZE, type ExplorerPorts } from './contracts';
import type { Labels } from './model';
import styles from './reactions-view.module.css';

const unscoped = (): 'unmapped' => 'unmapped';

function CompactRow(props: { readonly row: ReactionFilterRow; readonly equation: string; readonly reason?: string; readonly labels: Labels; readonly selected: boolean; readonly outside: string | undefined; readonly onSelect: (id: string) => void }) {
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
    </li>
  );
}

export function Results(props: {
  readonly ports: ExplorerPorts;
  readonly state: CanonicalState;
  readonly indexes: ReadonlyIndexes;
  readonly rows: readonly ReactionFilterRow[];
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
  const compactOf = (row: ReactionFilterRow, reason?: string) => {
    const card = reactionCard({ state: props.state, indexes: props.indexes, scopeOf: unscoped }, row.id);
    const equation = 'missing' in card ? '' : card.groups.map((group) => group.equation?.text ?? '').filter((text) => text !== '').join('; ');
    return <CompactRow key={row.id} row={row} equation={equation} labels={props.labels} selected={props.selected === row.id} outside={outsideOf(row)} onSelect={ports.select} {...(reason === undefined ? {} : { reason })} />;
  };
  return (
    <div className={styles.results}>
      <ul className={styles.list} aria-label="Reactions">
        {shown.map((row) =>
          props.view === 'compact' ? (
            compactOf(row)
          ) : (
            <li key={row.id} className={styles.cardItem}>
              {ports.renderCard({ reactionId: row.id, selected: props.selected === row.id, onSelect: ports.select, ...(outsideOf(row) === undefined ? {} : { outside: outsideOf(row) as string }), fallback: (reason) => <ul className={styles.fallback}>{compactOf(row, reason)}</ul> })}
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
