/** "Continue where you left off" (step 8.4g Part B, G3): the last records opened, at most five, at the top of the Chapters list. A record that is gone is left out; with none, nothing is drawn. */
import { useSyncExternalStore } from 'react';
import { nameOfRecord } from '@/features/inspector';
import type { AnyRecord, CanonicalState, RecordRef } from '@/core/schema';
import type { MyRecords } from './my-records';
import styles from './continue-strip.module.css';

export const STRIP_SIZE = 5;

export function ContinueStrip(props: { readonly state: CanonicalState; readonly mine: MyRecords; readonly onOpen: (ref: RecordRef, title: string) => void }) {
  const recent = useSyncExternalStore(props.mine.subscribe, props.mine.recent);
  const all = props.state.records as unknown as Readonly<Record<string, Readonly<Record<string, AnyRecord>> | undefined>>;
  const rows = recent.flatMap((ref) => {
    const record = all[ref.kind]?.[ref.id];
    return record === undefined ? [] : [{ ref, title: nameOfRecord(record) }];
  }).slice(0, STRIP_SIZE);
  if (rows.length === 0) return null;
  return (
    <section className={styles.strip} aria-label="Continue where you left off">
      <h3 className={styles.heading}>Continue where you left off</h3>
      <ul className={styles.list}>
        {rows.map((row) => (
          <li key={`${row.ref.kind}:${row.ref.id}`}>
            <button type="button" className={styles.item} onClick={() => props.onOpen(row.ref, row.title)}>
              {row.title}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
