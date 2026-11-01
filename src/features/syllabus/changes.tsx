/**
 * "What changed" (7.6 D): the topics that differ between the chosen version (A) and the one compared with (B), in three groups: new in A,
 * not in A any more, and changed (the level in B, then in A). Each row says how many records the change affects and links to the chapter.
 * 60 rows per group. "No change in topics" when the two cover the same topics at the same levels.
 */
import { useState } from 'react';
import { plural } from '@/core/text';
import type { ChangedRow, DiffRow } from '@/core/syllabus';
import { ROWS_PAGE } from './model';
import { ChapterLink } from './topic-row';
import styles from './syllabus-view.module.css';

interface Props {
  readonly labelA: string;
  readonly added: readonly DiffRow[];
  readonly removed: readonly DiffRow[];
  readonly changed: readonly ChangedRow[];
  readonly empty: boolean;
  readonly chapterName: (id: string) => string;
  readonly isChapter: (id: string) => boolean;
  readonly openChapter: (id: string) => void;
}

function Group(props: { readonly heading: string; readonly rows: readonly (DiffRow & { readonly levels?: string })[]; readonly chapterName: Props['chapterName']; readonly isChapter: Props['isChapter']; readonly openChapter: Props['openChapter'] }) {
  const [limit, setLimit] = useState(ROWS_PAGE);
  const shown = props.rows.slice(0, limit);
  return (
    <div>
      <h4 className={styles.groupHeading}>{props.heading}</h4>
      {props.rows.length === 0 ? <p className={styles.muted}>None</p> : null}
      <ul className={styles.rows} aria-label={props.heading}>
        {shown.map((row) => (
          <li key={row.topicId} className={styles.row} data-topic-id={row.topicId}>
            <span className={styles.rowName}>{row.name}</span>
            {row.levels === undefined ? null : <span className={styles.counts}>{row.levels}</span>}
            <span className={styles.counts}>{`affects ${plural(row.records, 'record', 'records')}`}</span>
            <ChapterLink chapterId={row.chapterId} isChapter={row.chapterId !== undefined && props.isChapter(row.topicId)} chapterName={props.chapterName} open={props.openChapter} />
          </li>
        ))}
      </ul>
      {props.rows.length > shown.length ? (
        <div className={styles.more}>
          <p className={styles.muted} role="status">{`Showing ${shown.length} of ${props.rows.length} topics`}</p>
          <button type="button" onClick={() => setLimit((n) => n + ROWS_PAGE)}>{`Show ${ROWS_PAGE} more`}</button>
        </div>
      ) : null}
    </div>
  );
}

export function Changes(props: Props) {
  const { labelA } = props;
  const shared = { chapterName: props.chapterName, isChapter: props.isChapter, openChapter: props.openChapter };
  return (
    <section className={styles.changes} aria-label="What changed">
      <h3 className={styles.unitHeading}>What changed</h3>
      {props.empty ? <p className={styles.muted}>No change in topics</p> : null}
      <Group heading={`New in ${labelA}`} rows={props.added} {...shared} />
      <Group heading={`Not in ${labelA} any more`} rows={props.removed} {...shared} />
      <Group heading="Changed" rows={props.changed.map((row) => ({ ...row, levels: `${row.from} → ${row.to}` }))} {...shared} />
    </section>
  );
}
