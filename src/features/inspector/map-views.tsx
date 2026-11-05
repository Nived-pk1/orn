/**
 * The inspector's two views of what is NOT a record on the map (step 8.2b-fix, S2, S3; a lazy chunk): an ARROW (chip "Arrow", the title
 * "<from> → <to>", its two ends as cards, its reactions as rows) and the BUCKET (the derived "Not in a family yet" node: its compounds,
 * each with where it is made from and where it goes on to). They only draw what `mapInspectorView` answers; a tap on an end card or a
 * family chip focuses that family, a tap on a row opens the real record (a reaction, or the compound).
 */
import type { ReactNode } from 'react';
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
  readonly titleId: string;
  /** Back and Forward, drawn on the header line. */
  readonly history?: ReactNode;
  /** The ordered reaction rows with their examples folded (the arrow's list), drawn by the host. */
  readonly reactionsList?: ReactNode;
}

function Head(props: { readonly chip: string; readonly title: string; readonly titleId: string; readonly history?: ReactNode }) {
  return (
    <header className={study.head}>
      <div className={study.headText}>
        <span className={study.kindChip}>{props.chip}</span>
        <h3 id={props.titleId} className={study.titleText}>
          {props.title}
        </h3>
      </div>
      {props.history}
    </header>
  );
}

export function ArrowPane(props: { readonly view: ArrowView; readonly actions: MapViewActions }) {
  const { view, actions } = props;
  const end = (one: ArrowEnd) => (
    <li key={one.id}>
      <button type="button" className={`${styles.end} ${one.bucket ? styles.endBucket : ''}`} onClick={() => actions.focusEnd(one.id)}>
        {one.name}
      </button>
    </li>
  );
  return (
    <article aria-label="Arrow" data-subject="arrow" data-from={view.from.id} data-to={view.to.id}>
      <Head chip={view.chip} title={view.title} titleId={actions.titleId} history={actions.history} />
      <ul className={styles.ends} aria-label="Ends of this arrow">
        {end(view.from)}
        <li aria-hidden="true" className={styles.arrowSign}>
          →
        </li>
        {end(view.to)}
      </ul>
      {actions.reactionsList}
    </article>
  );
}

const chipsLabel = (head: string, chips: BucketView['rows'][number]['madeFrom']): string => `${head}: ${chips.map((chip) => `${chip.name} (${chip.count})`).join(', ')}`;

export function BucketPane(props: { readonly view: BucketView; readonly actions: MapViewActions }) {
  const { view, actions } = props;
  return (
    <article aria-label="Not in a family yet" data-subject="bucket">
      <Head chip={view.chip} title={view.title} titleId={actions.titleId} history={actions.history} />
      <p className={styles.line}>{view.lead}</p>
      {view.authorsLine === undefined ? null : <p className={styles.authors}>{view.authorsLine}</p>}
      {view.rows.length === 0 ? null : (
        <ul className={styles.list} aria-label="Compounds in no family">
          {view.rows.map((row) => (
            <li key={`${row.ref.kind}:${row.ref.id}`} className={styles.compound}>
              <button type="button" className={styles.row} onClick={() => actions.open(row.ref)}>
                <span>{row.name}</span>
                <span className={styles.count}>{`${row.reactions} ${row.reactions === 1 ? 'reaction' : 'reactions'}`}</span>
              </button>
              {row.madeFrom.length === 0 && row.goesOn.length === 0 ? null : (
                <ul className={styles.chips}>
                  {[
                    ...row.madeFrom.map((chip) => ({ chip, head: 'Made from' as const })),
                    ...row.goesOn.map((chip) => ({ chip, head: 'Goes on to' as const })),
                  ].map(({ chip, head }) => (
                    <li key={`${head}:${chip.id}`}>
                      <button type="button" className={styles.chip} onClick={() => actions.focusEnd(chip.id)} aria-label={chipsLabel(head, [chip])}>
                        {chipsLabel(head, [chip])}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
