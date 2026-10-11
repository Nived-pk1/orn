/**
 * The palette's rows (step 5.8): the hits grouped by kind (groups in the order of their best hit; inside a group the engine's order),
 * flattened to header and hit rows of fixed heights, and the window of rows to render for a scroll position. Pure and bounded.
 */
import type { RecordKind } from '@/core/schema';
import type { SearchHit } from '@/search/contracts';

export const HIT_ROW_HEIGHT = 48;
export const HEADER_ROW_HEIGHT = 28;
export const LIST_HEIGHT = 360;
export const WINDOW_OVERSCAN = 4;

export type PaletteRow =
  | { readonly type: 'header'; readonly key: string; readonly kind: RecordKind; readonly count: number }
  | { readonly type: 'hit'; readonly key: string; readonly hit: SearchHit; readonly kind: RecordKind };

export const hitKey = (hit: SearchHit): string => `${hit.ref.kind}:${hit.ref.id}`;

export function groupRows(hits: readonly SearchHit[]): PaletteRow[] {
  const groups = new Map<RecordKind, SearchHit[]>();
  for (const hit of hits) {
    const list = groups.get(hit.ref.kind);
    if (list === undefined) groups.set(hit.ref.kind, [hit]);
    else list.push(hit);
  }
  const rows: PaletteRow[] = [];
  for (const [kind, list] of groups) {
    rows.push({ type: 'header', key: `header:${kind}`, kind, count: list.length });
    for (const hit of list) rows.push({ type: 'hit', key: hitKey(hit), hit, kind });
  }
  return rows;
}

export const heightOf = (row: PaletteRow): number => (row.type === 'header' ? HEADER_ROW_HEIGHT : HIT_ROW_HEIGHT);

export interface RowWindow {
  /** Index of the first row rendered and one past the last. */
  readonly start: number;
  readonly end: number;
  /** Heights of what is not rendered above and below (spacers). */
  readonly before: number;
  readonly after: number;
  readonly total: number;
}

/** The rows to render for a scroll offset and a visible height, with `WINDOW_OVERSCAN` rows beyond each side. */
export function windowOf(rows: readonly PaletteRow[], scrollTop: number, height: number): RowWindow {
  let total = 0;
  const tops: number[] = [];
  for (const row of rows) {
    tops.push(total);
    total += heightOf(row);
  }
  if (rows.length === 0) return { start: 0, end: 0, before: 0, after: 0, total: 0 };
  const top = Math.max(0, scrollTop);
  const bottom = top + Math.max(0, height);
  let first = 0;
  while (first < rows.length - 1 && (tops[first + 1] as number) <= top) first += 1;
  let last = first;
  while (last < rows.length - 1 && (tops[last + 1] as number) < bottom) last += 1;
  const start = Math.max(0, first - WINDOW_OVERSCAN);
  const end = Math.min(rows.length, last + 1 + WINDOW_OVERSCAN);
  const before = tops[start] as number;
  const endTop = end >= rows.length ? total : (tops[end] as number);
  return { start, end, before, after: total - endTop, total };
}

/** The scroll offset that brings row `index` fully into a window of `height`, from the current offset. */
export function scrollToShow(rows: readonly PaletteRow[], index: number, scrollTop: number, height: number): number {
  let top = 0;
  for (let i = 0; i < index && i < rows.length; i += 1) top += heightOf(rows[i] as PaletteRow);
  const row = rows[index];
  if (row === undefined) return scrollTop;
  const bottom = top + heightOf(row);
  // a hit right under its group header shows the header too
  const above = index > 0 && rows[index - 1]?.type === 'header' ? top - HEADER_ROW_HEIGHT : top;
  if (above < scrollTop) return above;
  if (bottom > scrollTop + height) return bottom - height;
  return scrollTop;
}

/** The next hit row from `from` in a direction (`step` rows at a time, headers skipped); stays at the end. */
export function nextHit(rows: readonly PaletteRow[], from: number, direction: 1 | -1, step = 1): number {
  const hits = rows.map((row, index) => (row.type === 'hit' ? index : -1)).filter((index) => index >= 0);
  if (hits.length === 0) return -1;
  const at = hits.indexOf(from);
  const next = Math.min(hits.length - 1, Math.max(0, (at < 0 ? (direction === 1 ? -1 : hits.length) : at) + direction * step));
  return hits[next] as number;
}
