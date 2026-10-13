import { useVirtualizer } from '@tanstack/react-virtual';
import { forwardRef, useImperativeHandle, useRef, type ReactNode, type Ref } from 'react';
import styles from './virtual-list.module.css';

/** What a parent can ask of the list: bring an item to the top. */
export interface VirtualListHandle {
  scrollToIndex(index: number): void;
}

export interface VirtualListProps<T> {
  readonly items: readonly T[];
  /** A stable key per item (the item's identity, never its position). */
  readonly itemKey: (item: T, index: number) => string;
  /** The height guessed before an item is measured, in px; the real height replaces it once the item is on screen. */
  readonly estimateSize: (item: T, index: number) => number;
  readonly renderItem: (item: T, index: number) => ReactNode;
  /** Names the list for screen readers (a list of listitems; items carry their position and the size of the whole list). */
  readonly label: string;
  /** Items rendered beyond the visible ones on each side (default 4). */
  readonly overscan?: number;
  /** The scroll area's size before it is measured (tests and the first paint). */
  readonly initialRect?: { readonly width: number; readonly height: number };
  /** The scroll area takes a tab stop (a long list whose rows hold nothing focusable must still be reachable by keyboard: axe scrollable-region-focusable). */
  readonly focusable?: boolean;
}

const DEFAULT_OVERSCAN = 4;
const INITIAL_RECT = { width: 800, height: 600 } as const;

/**
 * A virtualised list with variable item heights (step 5.5b; PERFORMANCE_ARCHITECTURE §8). It owns its scroll area and renders only the
 * items near the viewport, so a list of any length keeps the DOM small. Semantics stay those of a list: `ul` with `li` items that say
 * their position in the whole list, so a screen reader hears "3 of 1200". Items are positioned through React style props (the CSSOM,
 * which the page's CSP allows), never a style attribute written into markup. An item's own content is responsible for being keyboard
 * reachable; the list adds no tab stops. Heights are measured with the item's rendered size.
 */
function VirtualListInner<T>(props: VirtualListProps<T>, ref: Ref<VirtualListHandle>) {
  const { items, itemKey, estimateSize, renderItem, label } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroller.current,
    estimateSize: (index) => estimateSize(items[index] as T, index),
    getItemKey: (index) => itemKey(items[index] as T, index),
    overscan: props.overscan ?? DEFAULT_OVERSCAN,
    initialRect: props.initialRect ?? INITIAL_RECT,
    // no synchronous re-render inside a resize callback: WebKit reports that as an uncaught "ResizeObserver loop completed with undelivered
    // notifications" (found by the Gate E run, step 5.10a)
    useFlushSync: false,
  });
  useImperativeHandle(ref, () => ({ scrollToIndex: (index) => virtualizer.scrollToIndex(index, { align: 'start' }) }), [virtualizer]);
  return (
    <div className={styles.scroller} ref={scroller} data-virtual-list="" {...(props.focusable === true ? { tabIndex: 0, role: 'group', 'aria-label': `${label} (scrollable)` } : {})}>
      <ul className={styles.list} aria-label={label} style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => (
          <li
            key={row.key}
            ref={virtualizer.measureElement}
            data-index={row.index}
            className={styles.item}
            aria-posinset={row.index + 1}
            aria-setsize={items.length}
            style={{ transform: `translateY(${row.start}px)` }}
          >
            {renderItem(items[row.index] as T, row.index)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export const VirtualList = forwardRef(VirtualListInner) as <T>(props: VirtualListProps<T> & { readonly ref?: Ref<VirtualListHandle> }) => ReturnType<typeof VirtualListInner>;
