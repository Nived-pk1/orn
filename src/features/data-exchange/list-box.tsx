/**
 * A bordered, virtualised list for the import screen's long lists (conflicts, findings, review items, quarantined records). The box
 * is no taller than its rows need, at most `MAX_BOX` px, so a short list does not leave an empty frame. Items are rendered as text.
 */
import type { CSSProperties, ReactNode } from 'react';
import { VirtualList } from '@/ui/primitives';
import styles from './import.module.css';

const MAX_BOX = 220;

export function ListBox<T>(props: {
  readonly label: string;
  readonly items: readonly T[];
  readonly itemKey: (item: T, index: number) => string;
  readonly render: (item: T, index: number) => ReactNode;
  /** The height guessed for one row, in px. */
  readonly rowHeight?: number;
}) {
  const row = props.rowHeight ?? 40;
  const height = Math.min(MAX_BOX, Math.max(row + 4, props.items.length * row + 2));
  const style = { '--import-list-height': `${height}px` } as CSSProperties;
  return (
    <div className={styles.listBox} style={style}>
      <VirtualList
        label={props.label}
        items={props.items}
        itemKey={props.itemKey}
        estimateSize={() => row}
        renderItem={props.render}
        initialRect={{ width: 800, height }}
        focusable
      />
    </div>
  );
}
