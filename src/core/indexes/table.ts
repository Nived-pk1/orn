/**
 * A keyed multi-map with owner retraction: the building block of the cross-record indexes (step 2.1).
 * Every value belongs to one owner record; `removeOwner` retracts exactly what that record contributed,
 * so applying a ChangeSet costs O(changed records × their entries), never a scan.
 *
 * Buckets are replaced, never mutated in place after `commit()`, so an array handed out earlier stays a
 * valid snapshot. Order is deterministic: the table's comparator, then owner ID.
 */

interface Slot<V> {
  readonly owner: string;
  readonly value: V;
}

interface Bucket<V> {
  readonly slots: readonly Slot<V>[];
  readonly view: readonly V[];
}

const EMPTY: readonly never[] = [];

export class Table<V> {
  private readonly buckets = new Map<string, Bucket<V>>();
  /** Owner ID → the distinct keys it contributes to (needed to retract them). */
  private readonly keysOf = new Map<string, Set<string>>();
  /** Buckets changed since the last `commit()`; private copies, sorted and published by `commit()`. */
  private readonly pending = new Map<string, Slot<V>[]>();

  constructor(private readonly compareValues: (a: V, b: V) => number) {}

  add(owner: string, key: string, value: V): void {
    this.open(key).push({ owner, value });
    const keys = this.keysOf.get(owner);
    if (keys === undefined) this.keysOf.set(owner, new Set([key]));
    else keys.add(key);
  }

  removeOwner(owner: string): void {
    for (const key of this.keysOf.get(owner) ?? EMPTY) {
      this.pending.set(key, this.open(key).filter((slot) => slot.owner !== owner));
    }
    this.keysOf.delete(owner);
  }

  /** Sorts and publishes every changed bucket. Call once after a batch of `add` / `removeOwner`. */
  commit(): void {
    for (const [key, slots] of this.pending) {
      if (slots.length === 0) {
        this.buckets.delete(key);
        continue;
      }
      slots.sort(
        (a, b) => this.compareValues(a.value, b.value) || (a.owner < b.owner ? -1 : a.owner > b.owner ? 1 : 0),
      );
      this.buckets.set(key, { slots, view: slots.map((slot) => slot.value) });
    }
    this.pending.clear();
  }

  /** Every key that has at least one value; only valid between `commit()` calls. */
  keys(): IterableIterator<string> {
    return this.buckets.keys();
  }

  /** Values under `key`, in deterministic order; only valid between `commit()` calls. */
  get(key: string): readonly V[] {
    return this.buckets.get(key)?.view ?? EMPTY;
  }

  private open(key: string): Slot<V>[] {
    let slots = this.pending.get(key);
    if (slots === undefined) {
      slots = [...(this.buckets.get(key)?.slots ?? EMPTY)];
      this.pending.set(key, slots);
    }
    return slots;
  }
}

export const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Sorted, deduplicated union of string-like values. */
export function sortedUnion<T extends string>(lists: Iterable<readonly T[]>): T[] {
  const seen = new Set<T>();
  for (const list of lists) for (const item of list) seen.add(item);
  return [...seen].sort(compareStrings);
}
