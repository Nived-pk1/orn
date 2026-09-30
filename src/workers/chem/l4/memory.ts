/**
 * The memory of inputs the toolkit could not check (Q10 e; step 4.3a review, decision 3). An input that traps or hangs RDKit costs
 * 30-45 ms (a trap) or 2 s plus a restart (a hang) every time, so it is remembered and not sent again until it changes. Key: the
 * input (its content) plus the toolkit version, so a new RDKit tries it again. In memory on MAIN, this session only, so a worker
 * restart does not make it forget. Bounded: the oldest entry is forgotten first (a forgotten input is just sent again).
 */
export interface NotCheckable {
  readonly reason: 'unavailable' | 'timeout';
  readonly message: string;
}

export interface NotCheckableMemory {
  get(input: string, toolkitVersion: string): NotCheckable | undefined;
  add(input: string, toolkitVersion: string, entry: NotCheckable): void;
  readonly size: number;
}

export function createNotCheckableMemory(cap: number): NotCheckableMemory {
  const table = new Map<string, NotCheckable>();
  const keyOf = (input: string, version: string): string => `${version}\u0000${input}`;
  return {
    get: (input, version) => table.get(keyOf(input, version)),
    add(input, version, entry) {
      const key = keyOf(input, version);
      table.delete(key);
      table.set(key, entry);
      while (table.size > cap) {
        const oldest = table.keys().next();
        if (oldest.done === true) break;
        table.delete(oldest.value);
      }
    },
    get size() {
      return table.size;
    },
  };
}
