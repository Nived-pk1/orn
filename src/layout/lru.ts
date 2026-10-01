/**
 * A small least-recently-used cache (a `Map` keeps insertion order). Bounded by construction (CLAUDE.md §1.6). Pure. The chem
 * service has the same few lines; the services are isolated from each other on purpose (dependency-cruiser `services-isolated`).
 */
export class LruCache<V> {
  private readonly entries = new Map<string, V>();

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('an LRU cache needs a capacity of at least 1');
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: string): V | undefined {
    const value = this.entries.get(key);
    if (value === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    if (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next();
      if (oldest.done !== true) this.entries.delete(oldest.value);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}
