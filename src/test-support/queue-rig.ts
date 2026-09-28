/**
 * A write queue over a scripted `persist` and a manual scheduler, plus a chain of ChangeSets over a fixture.
 * Shared by the queue's unit tests (retry delays are asserted, never slept). Test-only.
 */
import { produce } from 'immer';
import { diffStates } from '@/core/dataset';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { CanonicalState } from '@/core/schema';
import type { PendingBatch } from '@/persistence/coalesce';
import type { SaveStatus } from '@/persistence/contracts';
import { createWriteQueue, type WriteQueueOptions } from '@/persistence/write-queue';
import { manualScheduler } from './persistence-kit';
import { loadFixtureState } from './state-fixture';

const base = loadFixtureState('maximal-valid');
const ids = Object.keys(base.records.species);

/** Successive states, each renaming one more species; `changes[i]` leads to `states[i]` (revision i + 1). */
export function history(length: number): { states: CanonicalState[]; changes: ChangeSet[] } {
  const states: CanonicalState[] = [];
  const changes: ChangeSet[] = [];
  let before = base;
  for (let i = 0; i < length; i += 1) {
    const after = produce(before, (draft) => {
      (draft.records.species[ids[i % ids.length] as string] as unknown as { names: { canonical: string } }).names.canonical = `name ${i}`;
    });
    changes.push({ revision: i + 1, label: `edit ${i}`, cause: 'command', ...diffStates(before, after), patches: [], inversePatches: [] });
    states.push(after);
    before = after;
  }
  return { states, changes };
}

export interface Rig {
  readonly queue: ReturnType<typeof createWriteQueue>;
  readonly scheduler: ReturnType<typeof manualScheduler>;
  readonly batches: { revision: number; count: number; touched: number }[];
  readonly statuses: SaveStatus[];
  readonly script: { fail: (() => Error | undefined)[] };
  quotaCalls: number;
}

/** `script.fail` is consumed one entry per persist call: an Error fails that call, undefined lets it succeed. */
export function rig(options: Partial<WriteQueueOptions> & { quotaFrees?: number } = {}): Rig {
  const scheduler = manualScheduler();
  const batches: Rig['batches'] = [];
  const script = { fail: [] as (() => Error | undefined)[] };
  const state = { quotaCalls: 0, quotaFrees: options.quotaFrees ?? 0 };
  const queue = createWriteQueue({
    scheduler,
    persist: async (batch: PendingBatch) => {
      batches.push({ revision: batch.revision, count: batch.count, touched: batch.touched.size });
      const error = script.fail.shift()?.();
      if (error !== undefined) throw error;
    },
    onQuota: async () => {
      state.quotaCalls += 1;
      if (state.quotaFrees <= 0) return false;
      state.quotaFrees -= 1;
      return true;
    },
    ...options,
  });
  const statuses: SaveStatus[] = [];
  queue.subscribe((s) => statuses.push(s));
  return {
    queue,
    scheduler,
    batches,
    statuses,
    script,
    get quotaCalls() {
      return state.quotaCalls;
    },
  } as Rig;
}
export const boom = (message = 'disk on fire') => () => new Error(message);
