/**
 * The L4 service (see contracts.ts). What it re-checks, per ChangeSet (Q10 c):
 *   - a species that was created, or updated in something its checks read (structure, formula, charge, listed classes): that
 *     species, and CHEM-009 for its old AND its new canonical-structure group (through the derived map), nothing else;
 *   - a reaction or a mechanism that was created or updated: that record;
 *   - a deleted species: its groups are refreshed (its findings were cleared by the store's commit step, Q10 b).
 * Records that merely REFER to what changed are re-checked too (reviewer's follow-up b, step 4.3b review; fanout.ts): the reactions
 * of a species whose check signature changed, the species of a class whose SMARTS or parents changed. At most RECHECK_CAP such
 * records per change are queued at once; the rest wait in a backlog, in order, and are queued behind them as the queue empties
 * (never dropped; they show as `pending`). `checkAll` re-checks everything.
 */
import type { ChangeSet } from '@/core/dataset/contracts';
import type { RecordRef } from '@/core/schema';
import { createContext, refKey } from './context';
import { classesReadByChecks, reactionsReferring, RECHECK_CAP, speciesListingClasses } from './fanout';
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
  /** Queued only because something they refer to changed: a reaction among them with an unchanged plan is not sent again. */
  const referred = new Set<string>();
  /** Referrers behind the cap, in the order they will be queued (key `kind:id`). */
  const backlog = new Map<string, RecordRef>();
  ctx.watchBacklog(() => backlog.size);
  let scheduled = false;
  let running: Promise<void> | undefined;

  const hasDirty = (): boolean => KINDS.some((kind) => dirty[kind].size > 0);
  const hasWork = (): boolean => hasDirty() || backlog.size > 0;
  const promote = (): void => {
    for (const [key, ref] of [...backlog].slice(0, RECHECK_CAP)) {
      backlog.delete(key);
      if (isChecked(ref.kind)) dirty[ref.kind].add(ref.id);
    }
  };
  const mark = (ref: RecordRef): void => {
    if (!isChecked(ref.kind)) return;
    backlog.delete(refKey(ref));
    dirty[ref.kind].add(ref.id);
  };
  /** Queues referrers: the first RECHECK_CAP now (unless already queued), the rest behind them. */
  const queueReferrers = (refs: readonly RecordRef[]): void => {
    const fresh = refs.filter((ref) => !(isChecked(ref.kind) && dirty[ref.kind].has(ref.id)) && !backlog.has(refKey(ref)));
    fresh.slice(0, RECHECK_CAP).forEach((ref) => {
      mark(ref);
      referred.add(refKey(ref));
    });
    for (const ref of fresh.slice(RECHECK_CAP)) {
      backlog.set(refKey(ref), ref);
      referred.add(refKey(ref));
    }
    if (fresh.length > 0) ctx.countReferrers(Math.min(fresh.length, RECHECK_CAP), fresh.length);
  };
  const queue = (): void => {
    if (scheduled || ctx.disposed()) return;
    scheduled = true;
    options.schedule(() => void flush());
  };

  async function loop(): Promise<void> {
    while (hasWork() && !ctx.disposed()) {
      if (!hasDirty()) promote();
      const due = { species: [...dirty.species].sort(), reaction: [...dirty.reaction].sort(), mechanism: [...dirty.mechanism].sort() };
      const onlyIfChanged = new Set(due.reaction.filter((id) => referred.delete(refKey({ kind: 'reaction', id }))));
      for (const id of due.species) referred.delete(refKey({ kind: 'species', id }));
      for (const kind of KINDS) dirty[kind].clear();
      try {
        // Species first: what they find (the not-checkable memory, the canonical structures) is what the others may lean on.
        await runSpeciesJob(ctx, due.species);
        await runReactionJob(ctx, due.reaction, onlyIfChanged);
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
      ctx.announce();
    }
  }

  const markAll = (): void => {
    const { records } = options.state();
    backlog.clear();
    referred.clear();
    for (const kind of KINDS) for (const id of Object.keys(records[kind])) dirty[kind].add(id);
  };

  return {
    onChange(changes: ChangeSet): void {
      if (ctx.disposed()) return;
      const state = options.state();
      const speciesMoved: string[] = [];
      for (const ref of changes.deleted) {
        if (!isChecked(ref.kind)) continue;
        dirty[ref.kind].delete(ref.id);
        backlog.delete(refKey(ref));
        referred.delete(refKey(ref));
        if (ref.kind === 'species') speciesMoved.push(ref.id);
        if (ref.kind === 'species') forgetSpecies(ctx, ref.id);
        else ctx.forget(ref);
      }
      for (const ref of changes.created) {
        if (!isChecked(ref.kind)) continue;
        mark(ref);
        referred.delete(refKey(ref));
        if (ref.kind === 'species') speciesMoved.push(ref.id);
      }
      for (const ref of changes.updated) {
        if (!isChecked(ref.kind)) continue;
        if (ref.kind !== 'species') {
          mark(ref);
          referred.delete(refKey(ref));
          continue;
        }
        const table = state.records.species;
        const species = Object.hasOwn(table, ref.id) ? table[ref.id] : undefined;
        if (speciesSignature(species) !== ctx.sent.get(refKey(ref))) {
          ctx.setFormula(ref.id, undefined); // what was derived belongs to the old structure
          mark(ref);
          referred.delete(refKey(ref));
          speciesMoved.push(ref.id);
        }
      }
      // what refers to what changed (reactions of a species, species of a class), bounded: see queueReferrers
      queueReferrers([...reactionsReferring(options, speciesMoved), ...speciesListingClasses(options, classesReadByChecks(changes))]);
      if (hasWork()) queue();
      ctx.flushFormulas();
      ctx.announce();
    },
    checkAll(): void {
      markAll();
      if (hasWork()) queue();
      ctx.announce();
    },
    flush,
    statusOf(ref: RecordRef) {
      if (isChecked(ref.kind) && (dirty[ref.kind].has(ref.id) || backlog.has(refKey(ref)))) return { state: 'pending' };
      return ctx.statusOf(ref);
    },
    summary() {
      const { pending, notChecked } = ctx.counts();
      return { queued: Math.max(pending, dirty.species.size + dirty.reaction.size + dirty.mechanism.size + backlog.size), notChecked };
    },
    derivedFormulaOf: (ref) => (ref.kind === 'species' ? ctx.formulaOf(ref.id) : undefined),
    speciesWithCanonical: (canonical) => ctx.groups.membersOf(canonical),
    subscribeFormulas: ctx.subscribeFormulas,
    subscribe: ctx.subscribe,
    stats: ctx.stats,
    dispose: ctx.dispose,
  };
}
