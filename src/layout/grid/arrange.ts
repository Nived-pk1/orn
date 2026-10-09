/**
 * Placing the boxes on the grid (step 5.5c). A column is as wide as its widest box and a row as tall as its tallest, with a stated
 * gap between neighbours (`COLUMN_GAP_FACTOR` and `ROW_GAP_FACTOR` times the request's `spacing.layer`). A box without a cell goes into a row
 * below the grid (row = last row + 1), one column per box, left to right in id order, from column 0. Boxes that share a cell are
 * stacked in it, top to bottom in id order, `spacing.node` apart; the row grows to hold them. Each box is centred in its cell.
 */
import type { LayoutNodeInput, LayoutRequest } from '../contracts';
import type { Rect } from './geometry';

/**
 * The gaps, as multiples of `spacing.layer`: between columns twice, between rows one and a half (96 px gives 192 and 144). Room
 * for a line, its count chip and the chip of the reverse arrow: two chips side by side need about 0.2 of the line each way.
 */
export const COLUMN_GAP_FACTOR = 2;
export const ROW_GAP_FACTOR = 1.5;

export interface Arrangement {
  readonly boxes: ReadonlyMap<string, Rect>;
  /** Number of cells that hold more than one box. */
  readonly sharedCells: number;
}

const cellKey = (column: number, row: number): string => `${column}:${row}`;

export function arrange(request: LayoutRequest): Arrangement {
  const columnGap = request.spacing.layer * COLUMN_GAP_FACTOR;
  const rowGap = request.spacing.layer * ROW_GAP_FACTOR;
  const stack = request.spacing.node;
  let lastRow = -1;
  for (const node of request.nodes) if (node.cell !== undefined) lastRow = Math.max(lastRow, node.cell.row);
  const cells = new Map<string, LayoutNodeInput[]>();
  let below = 0;
  for (const node of request.nodes) {
    const cell = node.cell ?? { column: below++, row: lastRow + 1 };
    const key = cellKey(cell.column, cell.row);
    const held = cells.get(key);
    if (held === undefined) cells.set(key, [node]);
    else held.push(node);
  }
  // nodes arrive sorted by id, so every cell's list is in id order
  const widthOfColumn = new Map<number, number>();
  const heightOfRow = new Map<number, number>();
  let sharedCells = 0;
  for (const [key, held] of cells) {
    const [column, row] = key.split(':').map(Number) as [number, number];
    if (held.length > 1) sharedCells += 1;
    const width = Math.max(...held.map((node) => node.width));
    const height = held.reduce((sum, node) => sum + node.height, 0) + stack * (held.length - 1);
    widthOfColumn.set(column, Math.max(widthOfColumn.get(column) ?? 0, width));
    heightOfRow.set(row, Math.max(heightOfRow.get(row) ?? 0, height));
  }
  const offsetOf = (sizes: ReadonlyMap<number, number>, gap: number): Map<number, number> => {
    const offsets = new Map<number, number>();
    let at = 0;
    for (const index of [...sizes.keys()].sort((a, b) => a - b)) {
      offsets.set(index, at);
      at += (sizes.get(index) as number) + gap;
    }
    return offsets;
  };
  const columnAt = offsetOf(widthOfColumn, columnGap);
  const rowAt = offsetOf(heightOfRow, rowGap);
  const boxes = new Map<string, Rect>();
  for (const [key, held] of cells) {
    const [column, row] = key.split(':').map(Number) as [number, number];
    const cellWidth = widthOfColumn.get(column) as number;
    const cellHeight = heightOfRow.get(row) as number;
    const stackHeight = held.reduce((sum, node) => sum + node.height, 0) + stack * (held.length - 1);
    let y = (rowAt.get(row) as number) + (cellHeight - stackHeight) / 2;
    for (const node of held) {
      boxes.set(node.id, { x: (columnAt.get(column) as number) + (cellWidth - node.width) / 2, y, width: node.width, height: node.height });
      y += node.height + stack;
    }
  }
  return { boxes, sharedCells };
}
