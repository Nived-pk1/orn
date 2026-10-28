/**
 * The List view's rows (step 5.7, item j): the SAME projection as the map, read from the Scene (the Scene is the projection with its
 * layout). Families: name, group, reactions out and reactions in; arrows: from, to, number of reactions. Nothing is added or left out
 * (a test compares them with the projection), the default order is the map's own, and the sorts are pure and total (ties end in
 * the id), so the same rows always come out in the same order.
 */
import type { Scene } from '@/render/scene';
import { plainText } from '@/render/svg';
import { bundleOf } from './canvas-menu';

export interface FamilyRow {
  readonly id: string;
  readonly name: string;
  readonly group: string;
  /** Reactions on the arrows that leave this family (a loop counts as out and as in). */
  readonly out: number;
  readonly in: number;
  /** The family's accessible name on the map. */
  readonly label: string;
}

export interface ArrowRow {
  readonly id: string;
  readonly fromId: string;
  readonly from: string;
  readonly toId: string;
  readonly to: string;
  readonly reactions: number;
  readonly label: string;
}

export interface ListRows {
  readonly families: readonly FamilyRow[];
  readonly arrows: readonly ArrowRow[];
}

export function listRowsOf(scene: Scene): ListRows {
  const names = new Map(scene.nodes.map((node) => [node.id, plainText(node.label)] as const));
  // the projection counts each family's DISTINCT reactions (a reaction that leaves by two arrows is one); a scene without them sums its arrows
  const out = new Map<string, number>();
  const into = new Map<string, number>();
  for (const edge of scene.edges) {
    const count = bundleOf(edge);
    out.set(edge.from, (out.get(edge.from) ?? 0) + count);
    into.set(edge.to, (into.get(edge.to) ?? 0) + count);
  }
  for (const node of scene.nodes) {
    if (node.reactionCounts === undefined) continue;
    out.set(node.id, node.reactionCounts.outAll);
    into.set(node.id, node.reactionCounts.inAll);
  }
  const families = scene.nodes
    .filter((node) => node.box === 'hub' || node.box === 'unclassified')
    .map<FamilyRow>((node) => ({ id: node.id, name: names.get(node.id) ?? node.id, group: node.group ?? '', out: out.get(node.id) ?? 0, in: into.get(node.id) ?? 0, label: node.ariaLabel }));
  const arrows = scene.edges.map<ArrowRow>((edge) => ({
    id: edge.id,
    fromId: edge.from,
    from: names.get(edge.from) ?? edge.from,
    toId: edge.to,
    to: names.get(edge.to) ?? edge.to,
    reactions: bundleOf(edge),
    label: edge.ariaLabel,
  }));
  return { families, arrows };
}

export type SortDirection = 'ascending' | 'descending';
export interface Sort {
  readonly column: string;
  readonly direction: SortDirection;
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Sorts a copy by one column; text by name (numbers inside names in numeric order), counts by value; ties end in the id. */
export function sortRows<T extends { readonly id: string }>(rows: readonly T[], sort: Sort | null, valueOf: (row: T, column: string) => string | number): readonly T[] {
  if (sort === null) return rows;
  const sign = sort.direction === 'ascending' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = valueOf(a, sort.column);
    const y = valueOf(b, sort.column);
    const by = typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y));
    return by !== 0 ? sign * by : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** The next sort of a column header press: ascending, then descending, then the map's own order. */
export function nextSort(current: Sort | null, column: string): Sort | null {
  if (current === null || current.column !== column) return { column, direction: 'ascending' };
  return current.direction === 'ascending' ? { column, direction: 'descending' } : null;
}

export const familyValue = (row: FamilyRow, column: string): string | number =>
  column === 'name' ? row.name : column === 'group' ? row.group : column === 'out' ? row.out : row.in;
export const arrowValue = (row: ArrowRow, column: string): string | number => (column === 'from' ? row.from : column === 'to' ? row.to : row.reactions);
