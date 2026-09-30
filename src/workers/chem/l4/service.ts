/**
 * The L4 service (see contracts.ts). What it re-checks, per ChangeSet (Q10 c):
 *   - a species that was created, or updated in something its checks read (structure, formula, charge, listed classes): that
 *     species, and CHEM-009 for its old AND its new canonical-structure group (through the derived map), nothing else;
 *   - a reaction or a mechanism that was created or updated: that record;
 *   - a deleted species: its groups are refreshed (its findings were cleared by the store's commit step, Q10 b).
 * Not re-checked, on purpose (reviewer's item c; see the step 4.3b report): records that merely REFER to what changed (a reaction
 * whose species changed structure, a species whose class changed its SMARTS). `checkAll` re-checks everything.
 */
import type { ChangeSet } from '@/core/dataset/contracts';
import type { RecordRef } from '@/core/schema';
import { createContext, refKey } from './context';
import type { L4Ports, L4Service } from './contracts';
import { runMechanismJob, runReactionJob } from './record-jobs';
import { forgetSpecies, runSpeciesJob, speciesSignature } from './species-job';

type CheckedKind = 'species' | 'reaction' | 'mechanism';
const KINDS: readonly CheckedKind[] = ['species', 'reaction', 'mechanism'];
const isChecked = (kind: string): kind is CheckedKind => KINDS.some((k) => k === kind);

export interface L4ServiceOptions extends L4Ports {
  /** Called with anything a job throws (a port failing is a programmer error); default: rethrown from a microtask, so it stays visible. */
  readonly onError?: (error: unknown) => void;
}

const rethrowLater = (error: unknown): void => queueMicrotask(() => {
  throw error;
});

export function createL4Service(options: L4ServiceOptions): L4Service {
  const ctx = createContext(options);
  const onError = options.onError ?? rethrowLater;
  const dirty: Record<CheckedKind, Set<string>> = { species: new Set(), reaction: new Set(), mechanism: new Set() };
  let scheduled = false;
  let running: Promise<void> | undefined;

  const hasWork = (): boolean => KINDS.some((kind) => dirty[kind].size > 0);
  const queue = (): void => {
    if (scheduled || ctx.disposed()) return;
    scheduled = true;
    options.schedule(() => void flush());
  };

  async function loop(): Promise<void> {
    while (hasWork() && !ctx.disposed()) {
      const due = { species: [...dirty.species].sort(), reaction: [...dirty.reaction].sort(), mechanism: [...dirty.mechanism].sort() };
      for (const kind of KINDS) dirty[kind].clear();
      try {
        // Species first: what they find (the not-checkable memory, the canonical structures) is what the others may lean on.
        await runSpeciesJob(ctx, due.species);
        await runReactionJob(ctx, due.reaction);
        await runMechanismJob(ctx, due.mechanism);
      } catch (error) {
        onError(error);
      }
    }
  }

  async function flush(): Promise<void> {
    scheduled = false;
    for (;;) {
      if (running !== undefined) {
        await running;
        continue;
      }
      if (!hasWork() || ctx.disposed()) return;
      running = loop().finally(() => void (running = undefined));
      await running;
    }
  }

  const markAll = (): void => {
    const { records } = options.state();
    for (const kind of KINDS) for (const id of Object.keys(records[kind])) dirty[kind].add(id);
  };

  return {
    onChange(changes: ChangeSet): void {
      if (ctx.disposed()) return;
      const state = options.state();
      for (const ref of changes.deleted) {
        if (!isChecked(ref.kind)) continue;
        dirty[ref.kind].delete(ref.id);
        if (ref.kind === 'species') forgetSpecies(ctx, ref.id);
        else ctx.forget(ref);
      }
      for (const ref of changes.created) if (isChecked(ref.kind)) dirty[ref.kind].add(ref.id);
      for (const ref of changes.updated) {
        if (!isChecked(ref.kind)) continue;
        if (ref.kind !== 'species') {
          dirty[ref.kind].add(ref.id);
          continue;
        }
        const table = state.records.species;
        const species = Object.hasOwn(table, ref.id) ? table[ref.id] : undefined;
        if (speciesSignature(species) !== ctx.sent.get(refKey(ref))) dirty.species.add(ref.id);
      }
      if (hasWork()) queue();
    },
    checkAll(): void {
      markAll();
      if (hasWork()) queue();
    },
    flush,
    statusOf(ref: RecordRef) {
      if (isChecked(ref.kind) && dirty[ref.kind].has(ref.id)) return { state: 'pending' };
      return ctx.statusOf(ref);
    },
    subscribe: ctx.subscribe,
    stats: ctx.stats,
    dispose: ctx.dispose,
  };
}
