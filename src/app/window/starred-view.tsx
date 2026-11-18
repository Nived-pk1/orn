/** The Starred view (step 8.4g Part B, G2): the records the reader starred, grouped by kind; each row opens its record. A lazy chunk. */
import { useSyncExternalStore } from 'react';
import { EmptyState, ListRow, ListRows } from '@/ui/primitives';
import type { CanonicalState, RecordRef } from '@/core/schema';
import type { MyRecords } from './my-records';
import { missingWords, starredGroups } from './starred-groups';
import styles from './starred-view.module.css';

export function StarredView(props: { readonly state: CanonicalState; readonly mine: MyRecords; readonly onOpen: (ref: RecordRef, title: string) => void }) {
  const starred = useSyncExternalStore(props.mine.subscribe, props.mine.starred);
  const { groups, missing } = starredGroups(props.state, starred);
  const footer = missingWords(missing);
  return (
    <article className={styles.page} aria-label="Starred">
      <p className={styles.label}>Study</p>
      <h1 className={styles.title}>Starred</h1>
      {groups.length === 0 ? (
        <EmptyState>Nothing starred yet. Press the star on any reaction or compound to keep it here.</EmptyState>
      ) : (
        groups.map((group) => (
          <section key={group.kind} aria-label={group.heading} className={styles.group}>
            <h2 className={styles.groupTitle}>{group.heading}</h2>
            <ListRows label={group.heading}>
              {group.rows.map((row) => (
                <ListRow key={`${row.ref.kind}:${row.ref.id}`} label={row.title} dataAttr={{ 'data-record-id': row.ref.id }} onOpen={() => props.onOpen(row.ref, row.title)} />
              ))}
            </ListRows>
          </section>
        ))
      )}
      {footer === undefined ? null : <p className={styles.footer}>{footer}</p>}
    </article>
  );
}
