/**
 * Reorder the items of an array field (participants, products, class memberships …) as one record
 * update. Items are identified by their `id` (or are the ID strings themselves), so the order is given
 * as a list of IDs and must be a permutation of the current ones: nothing is added, dropped or renamed.
 * `within` names an item of another array field that holds the array (the products of one outcome).
 */
import type { CanonicalState, RecordRef } from '../../schema';
import { recordAt } from '../lookup';
import { built, rejected, type BuildResult } from './types';

export interface ReorderSpec {
  readonly ref: RecordRef;
  readonly field: string;
  readonly within?: { readonly field: string; readonly id: string };
  readonly orderedIds: readonly string[];
  readonly label?: string;
}

type Bag = Readonly<Record<string, unknown>>;
const isBag = (value: unknown): value is Bag => typeof value === 'object' && value !== null && !Array.isArray(value);
const itemId = (item: unknown): string | undefined =>
  typeof item === 'string' ? item : isBag(item) && typeof item['id'] === 'string' ? item['id'] : undefined;
const arrayOf = (bag: Bag, field: string): readonly unknown[] | undefined => {
  const value = Object.hasOwn(bag, field) ? bag[field] : undefined;
  return Array.isArray(value) ? value : undefined;
};

function reordered(items: readonly unknown[], orderedIds: readonly string[]): readonly unknown[] | string {
  const byId = new Map<string, unknown>();
  for (const item of items) {
    const id = itemId(item);
    if (id === undefined || byId.has(id)) return 'Items must have distinct IDs to be reordered.';
    byId.set(id, item);
  }
  if (orderedIds.length !== items.length || new Set(orderedIds).size !== orderedIds.length || !orderedIds.every((id) => byId.has(id))) {
    return 'The new order must list every current item exactly once.';
  }
  return orderedIds.map((id) => byId.get(id));
}

export function reorderItems(state: CanonicalState, spec: ReorderSpec): BuildResult {
  const record = recordAt(state, spec.ref);
  if (record === undefined) return rejected({ code: 'NOT_FOUND', message: `${spec.ref.kind} ${spec.ref.id} does not exist.` });
  const root = record as unknown as Bag;
  const invalid = (message: string): BuildResult => rejected({ code: 'VALIDATION_FAILED', message });

  let next: Bag;
  if (spec.within === undefined) {
    const items = arrayOf(root, spec.field);
    if (items === undefined) return invalid(`"${spec.field}" is not a list on ${spec.ref.id}.`);
    const order = reordered(items, spec.orderedIds);
    if (typeof order === 'string') return invalid(order);
    next = { ...root, [spec.field]: order };
  } else {
    const { field: holderField, id: holderId } = spec.within;
    const holders = arrayOf(root, holderField);
    const index = holders?.findIndex((item) => itemId(item) === holderId) ?? -1;
    const holder = holders?.[index];
    if (holders === undefined || !isBag(holder)) return invalid(`"${holderField}" has no item ${holderId} on ${spec.ref.id}.`);
    const items = arrayOf(holder, spec.field);
    if (items === undefined) return invalid(`"${spec.field}" is not a list on ${holderId}.`);
    const order = reordered(items, spec.orderedIds);
    if (typeof order === 'string') return invalid(order);
    next = { ...root, [holderField]: holders.map((item, i) => (i === index ? { ...holder, [spec.field]: order } : item)) };
  }
  return built({
    label: spec.label ?? `Reorder ${spec.field}`,
    commands: [{ type: 'record.update', record: next as unknown as typeof record }],
    selectionHint: [spec.ref],
  });
}
