/**
 * One syllabus unit (7.6 D): its code and title as the heading, the official wording closed by default, the covered topics as rows (60 at a
 * time), and the "Not in this syllabus" line. In "Gaps only" the rows are the gap rows alone.
 */
import { useState } from 'react';
import type { UnitView } from '@/core/syllabus';
import type { SyllabusPorts } from './contracts';
import { ROWS_PAGE, type Row } from './model';
import { TopicRow } from './topic-row';
import styles from './syllabus-view.module.css';

export const unitHeading = (unit: UnitView): string => (unit.code === undefined ? unit.title : `${unit.code} · ${unit.title}`);

export function UnitSection(props: {
  readonly ports: SyllabusPorts;
  readonly unit: UnitView;
  readonly rows: readonly Row[];
  readonly phone: boolean;
  readonly chapterName: (id: string) => string;
  /** "Gaps only" hides the excluded line (it is about what is left out, not about gaps). */
  readonly showExcluded: boolean;
}) {
  const { ports, unit, rows } = props;
  const [limit, setLimit] = useState(ROWS_PAGE);
  const shown = rows.slice(0, limit);
  const heading = unitHeading(unit);
  return (
    <section className={styles.unit} aria-label={heading} data-unit-id={unit.id}>
      <h3 className={styles.unitHeading}>{heading}</h3>
      {unit.officialText === undefined ? null : (
        <details className={styles.official}>
          <summary>Official wording</summary>
          {ports.renderRichText(unit.officialText)}
        </details>
      )}
      {rows.length === 0 ? <p className={styles.muted}>No topic is listed for this unit.</p> : null}
      <ul className={styles.rows} aria-label={`Topics of ${heading}`}>
        {shown.map((row) => (
          <TopicRow key={row.node.topicId} node={row.node} depth={row.depth} editing={ports.editing} phone={props.phone} chapterName={props.chapterName} openChapter={ports.openChapter} />
        ))}
      </ul>
      {rows.length > shown.length ? (
        <div className={styles.more}>
          <p className={styles.muted} role="status">{`Showing ${shown.length} of ${rows.length} topics`}</p>
          <button type="button" onClick={() => setLimit((n) => n + ROWS_PAGE)}>{`Show ${ROWS_PAGE} more`}</button>
        </div>
      ) : null}
      {props.showExcluded && unit.excluded.length > 0 ? <p className={styles.excluded}>{`Not in this syllabus: ${unit.excluded.map((e) => e.name).join(', ')}`}</p> : null}
    </section>
  );
}
