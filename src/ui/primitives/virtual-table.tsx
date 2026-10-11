/**
 * A virtualised, accessible table (step 5.7, item j; UI_ARCHITECTURE section 11): the ARIA table pattern on divs (`table`, `rowgroup`,
 * `row`, `columnheader`, `cell`) with FIXED-height rows, so only the rows near the viewport are in the DOM while a screen reader still
 * hears the whole table (`aria-rowcount`, `aria-rowindex`). The header's sortable columns are buttons with `aria-sort`. The body has ONE
 * tab stop (a roving tabindex over the rows: arrows, Home, End, Page Up and Down move it; the row that has it is always rendered, so a
 * scroll never takes the tab stop away). A row reports a click or Space (`onRowOpen`), Enter (`onRowEnter`) and a double click
 * (`onRowDouble`); the table decides nothing about what they mean. Rows are placed through React style props (the CSSOM), never a style attribute.
 */
import { useVirtualizer, defaultRangeExtractor, type Range } from '@tanstack/react-virtual';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import styles from './virtual-table.module.css';

export interface TableColumn<T> {
  readonly id: string;
  readonly header: string;
  /** The grid track of the column, e.g. `2fr` or `7rem`. */
  readonly width: string;
  readonly cell: (row: T) => ReactNode;
  readonly sortable?: boolean;
  readonly numeric?: boolean;
}

export interface TableSort {
  readonly column: string;
  readonly direction: 'ascending' | 'descending';
}

export interface VirtualTableProps<T> {
  readonly label: string;
  readonly columns: readonly TableColumn<T>[];
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string;
  /** The row's accessible name (the cells are read too; this names the row for a screen reader's row list). */
  readonly rowLabel?: (row: T) => string;
  readonly sort: TableSort | null;
  readonly onSort: (column: string) => void;
  /** Click or Space on a row. */
  readonly onRowOpen?: (row: T) => void;
  /** Enter on a row. */
  readonly onRowEnter?: (row: T) => void;
  readonly onRowDouble?: (row: T) => void;
  /** The row height in px (fixed). */
  readonly rowHeight?: number;
  readonly overscan?: number;
  readonly initialRect?: { readonly width: number; readonly height: number };
}

const ROW_HEIGHT = 40;
const OVERSCAN = 6;
const INITIAL_RECT = { width: 800, height: 400 } as const;

export function VirtualTable<T>(props: VirtualTableProps<T>) {
  const { rows, columns, rowKey, sort } = props;
  const height = props.rowHeight ?? ROW_HEIGHT;
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const focusAfter = useRef(false);
  const last = Math.max(rows.length - 1, 0);
  const activeIndex = Math.min(active, last);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => height,
    getItemKey: (index) => rowKey(rows[index] as T),
    overscan: props.overscan ?? OVERSCAN,
    initialRect: props.initialRect ?? INITIAL_RECT,
    // the row that holds the tab stop is always in the DOM
    rangeExtractor: (range: Range) => {
      const wanted = new Set(defaultRangeExtractor(range));
      if (rows.length > 0) wanted.add(activeIndex);
      return [...wanted].sort((a, b) => a - b);
    },
  });
  const template = columns.map((column) => column.width).join(' ');

  useEffect(() => {
    if (!focusAfter.current) return;
    const row = scroller.current?.querySelector<HTMLElement>(`[data-row-index="${activeIndex}"]`);
    if (row === null || row === undefined) return;
    focusAfter.current = false;
    row.focus({ preventScroll: true });
  });

  const move = (to: number): void => {
    const next = Math.min(Math.max(to, 0), last);
    focusAfter.current = true;
    setActive(next);
    virtualizer.scrollToIndex(next, { align: 'auto' });
  };
  const page = Math.max(1, Math.floor((scroller.current?.clientHeight ?? INITIAL_RECT.height) / height) - 1);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, row: T, index: number): void => {
    if (event.target !== event.currentTarget) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        return move(index + 1);
      case 'ArrowUp':
        event.preventDefault();
        return move(index - 1);
      case 'PageDown':
        event.preventDefault();
        return move(index + page);
      case 'PageUp':
        event.preventDefault();
        return move(index - page);
      case 'Home':
        event.preventDefault();
        return move(0);
      case 'End':
        event.preventDefault();
        return move(last);
      case 'Enter':
        event.preventDefault();
        if (props.onRowEnter !== undefined) return props.onRowEnter(row);
        return props.onRowOpen?.(row);
      case ' ':
        event.preventDefault();
        return props.onRowOpen?.(row);
    }
  };

  return (
    <div className={styles.table} role="table" aria-label={props.label} aria-rowcount={rows.length + 1} aria-colcount={columns.length}>
      <div className={styles.head} role="rowgroup">
        <div className={styles.row} role="row" aria-rowindex={1} style={{ gridTemplateColumns: template }}>
          {columns.map((column, at) => {
            const sorted = sort !== null && sort.column === column.id ? sort.direction : undefined;
            return (
              <div key={column.id} role="columnheader" aria-colindex={at + 1} aria-sort={column.sortable === true ? (sorted ?? 'none') : undefined} className={column.numeric === true ? styles.numeric : styles.cell}>
                {column.sortable === true ? (
                  <button type="button" className={styles.sortButton} onClick={() => props.onSort(column.id)}>
                    {column.header}
                    <span aria-hidden="true">{sorted === 'ascending' ? ' ▲' : sorted === 'descending' ? ' ▼' : ''}</span>
                  </button>
                ) : (
                  column.header
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className={styles.scroller} ref={scroller} data-virtual-table="">
        <div className={styles.body} role="rowgroup" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index] as T;
            return (
              <div
                key={item.key}
                className={`${styles.row} ${styles.bodyRow}`}
                role="row"
                aria-rowindex={item.index + 2}
                aria-label={props.rowLabel?.(row)}
                data-row-index={item.index}
                data-row-key={rowKey(row)}
                tabIndex={item.index === activeIndex ? 0 : -1}
                style={{ gridTemplateColumns: template, height, transform: `translateY(${item.start}px)` }}
                onClick={() => {
                  setActive(item.index);
                  props.onRowOpen?.(row);
                }}
                onDoubleClick={() => props.onRowDouble?.(row)}
                onFocus={(event) => event.target === event.currentTarget && setActive(item.index)}
                onKeyDown={(event) => onKeyDown(event, row, item.index)}
              >
                {columns.map((column, at) => (
                  <div key={column.id} role="cell" aria-colindex={at + 1} className={column.numeric === true ? styles.numeric : styles.cell}>
                    {column.cell(row)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
