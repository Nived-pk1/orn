/**
 * The inspector's two views of what is NOT a record on the map (step 8.2b-fix, S2, S3; a lazy chunk): an ARROW (chip "Arrow", the title
 * "<from> → <to>", its two ends as cards, its reactions as rows) and the BUCKET (the derived "Not in a family yet" node: its compounds,
 * each with where it is made from and where it goes on to). They only draw what `mapInspectorView` answers; a tap on an end card or a
 * family chip focuses that family, a tap on a row opens the real record (a reaction, or the compound).
 */
import type { ReactNode } from 'react';
import { ListRow, ListRows } from '@/ui/primitives';
import type { RecordRef } from '@/core/schema';
import type { ArrowEnd, MapInspectorView } from './model/map-inspector-view';
import study from './study-inspector.module.css';
import styles from './map-views.module.css';

type ArrowView = Extract<MapInspectorView, { kind: 'arrow' }>;
type BucketView = Extract<MapInspectorView, { kind: 'bucket' }>;

export interface MapViewActions {
  /** Focuses a family or the bucket on the map (and shows it in the inspector). */
  readonly focusEnd: (id: string) => void;
  readonly open: (ref: RecordRef) => void;
  /** Shows the arrow between two map nodes in the panel (step 8.4b, C). */
  readonly openArrow?: (from: string, to: string) => void;
  readonly titleId: string;
  /** Back and Forward, drawn on the header line. */
  readonly history?: ReactNode;
  /** The ordered reaction rows with their examples folded (the arrow's list), drawn by the host. */
  readonly reactionsList?: ReactNode;
}

function Head(props: { readonly chip: string; readonly title: string; readonly summary: string; readonly titleId: string; readonly history?: ReactNode }) {
  return (
    <header className={study.head}>
      <div className={study.headText}>
        <div className={study.chipRow}>
          <span className={study.kindChip}>{props.chip}</span>
          <span className={study.headAside} data-head-aside="" />
        </div>
        <h3 id={props.titleId} className={study.titleText}>
          {props.title}
        </h3>
        <p className={study.summary} data-pane-summary="" data-sheet-full="">
          {props.summary}
        </p>
      </div>
      {props.history}
    </header>
  );
}

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
/** The arrow's summary says what KIND of arrow it is; its reaction count stays in the list heading only (step 8.3, A5). */
const arrowSummary = (from: ArrowEnd, to: ArrowEnd): string => (to.bucket ? 'Leads to compounds in no family yet' : from.bucket ? 'Comes from compounds in no family yet' : 'Between two families');

export function ArrowPane(props: { readonly view: ArrowView; readonly actions: MapViewActions }) {
  const { view, actions } = props;
  const end = (one: ArrowEnd) => <ListRow key={one.id} label={one.name} onOpen={() => actions.focusEnd(one.id)} />;
  return (
    <article aria-label="Arrow" data-subject="arrow" data-from={view.from.id} data-to={view.to.id}>
      <Head chip={view.chip} title={view.title} summary={arrowSummary(view.from, view.to)} titleId={actions.titleId} history={actions.history} />
      <ListRows label="Ends of this arrow">
        {end(view.from)}
        {end(view.to)}
      </ListRows>
      {actions.reactionsList}
    </article>
  );
}

const chipsLabel = (head: string, chips: BucketView['rows'][number]['madeFrom']): string => `${head}: ${chips.map((chip) => `${chip.name} (${chip.count})`).join(', ')}`;

export function BucketPane(props: { readonly view: BucketView; readonly actions: MapViewActions }) {
  const { view, actions } = props;
  return (
    <article aria-label="Not in a family yet" data-subject="bucket">
      <Head chip={view.chip} title={view.title} summary={count(view.rows.length, 'compound', 'compounds')} titleId={actions.titleId} history={actions.history} />
      <p className={styles.line}>{view.lead}</p>
      {view.authorsLine === undefined ? null : <p className={styles.authors}>{view.authorsLine}</p>}
      {view.arrows.length === 0 ? null : (
        <ListRows label="Arrows of this selection">
          {view.arrows.map((arrow) => (
            <ListRow key={`${arrow.from.id}>${arrow.to.id}`} label={`${arrow.from.name} → ${arrow.to.name}`} count={arrow.reactions} onOpen={() => actions.openArrow?.(arrow.from.id, arrow.to.id)} />
          ))}
        </ListRows>
      )}
      {view.rows.length === 0 ? null : (
        <ListRows label="Compounds in no family">
          {view.rows.map((row) => (
            <li key={`${row.ref.kind}:${row.ref.id}`} className={styles.compound}>
              <ul className={styles.nested}>
                <ListRow label={row.name} count={row.reactions} onOpen={() => actions.open(row.ref)} />
                {[...row.madeFrom.map((chip) => ({ chip, head: 'Made from' as const })), ...row.goesOn.map((chip) => ({ chip, head: 'Goes on to' as const }))].map(({ chip, head }) => (
                  <ListRow key={`${head}:${chip.id}`} label={`${head}: ${chip.name}`} count={chip.count} ariaLabel={chipsLabel(head, [chip])} onOpen={() => actions.focusEnd(chip.id)} />
                ))}
              </ul>
            </li>
          ))}
        </ListRows>
      )}
    </article>
  );
}
