/**
 * Lists of records in the inspector that can be long (step 5.6b, item k): a class' members, a concept's reactions, a topic's records.
 * Always a `VirtualList`, so the DOM keeps a handful of rows whatever the length; the box is as high as its rows, up to MAX_BOX px,
 * and the list says its size and each row says its place in the whole list ("3 of 1200").
 */
import type { ReactNode } from 'react';
import { VirtualList } from '@/ui/primitives';
import { RecordLink } from './rich-text';
import styles from './inspector.module.css';

type Ref = { readonly kind: string; readonly id: string };

const ROW_HEIGHT = 30;
const MAX_BOX = 240;

export interface RecordListProps<T extends Ref> {
  readonly label: string;
  readonly items: readonly T[];
  /** Words after the link on a row (e.g. "inferred, through ..."). */
  readonly suffix?: (item: T) => ReactNode;
  /** Words before the link on a row (e.g. the role). */
  readonly prefix?: (item: T) => ReactNode;
}

export function RecordList<T extends Ref>(props: RecordListProps<T>) {
  const { items, label, suffix, prefix } = props;
  if (items.length === 0) return null;
  const box = Math.min(MAX_BOX, items.length * ROW_HEIGHT + 2);
  return (
    <div className={styles.listBox} data-record-list="" data-size={items.length} style={{ height: box }}>
      <VirtualList
        label={`${label} (${items.length})`}
        items={items}
        itemKey={(item, index) => `${item.kind}:${item.id}:${index}`}
        estimateSize={() => ROW_HEIGHT}
        initialRect={{ width: 320, height: box }}
        renderItem={(item) => (
          <span className={styles.listRow}>
            {prefix === undefined ? null : prefix(item)}
            <RecordLink kind={item.kind} id={item.id} />
            {suffix === undefined ? null : suffix(item)}
          </span>
        )}
      />
    </div>
  );
}
