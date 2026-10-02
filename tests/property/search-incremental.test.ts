/**
 * Step 4.5, docs/TEST_STRATEGY.md §4 (P-07 style) for search: after random command sequences (renames, aliases, tags, lifecycle,
 * notes, creations, deletions, curriculum edits that move OTHER records’ derived data, undo, redo and a replaceState) the
 * incrementally maintained index holds exactly the documents a full build gives, and answers every query of a generated query set
 * exactly like an index rebuilt from scratch: same hits, same order, same scores.
 * The sync is flushed after every few steps (and at the end), as the app’s debounce would, so a document that depends on
 * another record is only refreshed when one of the dependency rules says so; a missed rule is a stale document here.
 */
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { smallParamsArb } from '@/test-support/arbitraries';
import { makeStore, testContext } from '@/test-support/command-kit';
import { resolveSearchIntent, searchIntentsArb, type SearchIntent } from '@/test-support/search-edits';
import { documentsOf, firstDifference, freshEngine, queriesOf, searchRig, type SearchRig } from '@/test-support/search-rig';
import { fullDocuments, searchStateOf } from '@/test-support/search-state';
import type { CanonicalState, RecordRef } from '@/core/schema';
import type { SearchSync } from '@/workers/search/sync';
import { PARAMS, TIMEOUT_MS } from './harness';

vi.setConfig({ testTimeout: Math.max(TIMEOUT_MS, 120_000) });

/**
 * A stand-in for the L4 service (step 5.1b, Q9): the derived formula of a species is a pure function of its structure, learned LATE
 * (at the flush points, as the chem worker's answers arrive) and announced with `refresh(ids)`, the way the app's wiring does.
 */
interface Formulas {
  readonly of: (ref: RecordRef) => string | undefined;
  /** Learns what the current state's structures derive to and tells the sync which species changed (new, edited, deleted). */
  learn(state: CanonicalState, sync: SearchSync): void;
  /** The toolkit "re-reads" every structure (a new version): every derived formula changes without any record changing. */
  bump(): void;
}
const derivedOf = (state: CanonicalState, id: string, version: number): string | undefined => {
  const species = Object.hasOwn(state.records.species, id) ? state.records.species[id] : undefined;
  // the generated species have no structure, so the stand-in derives from the canonical name (an edit of it changes the formula)
  const name = species?.names.canonical;
  return name === undefined ? undefined : `Dx${name.length}Q${name.charCodeAt(0) % 7}V${version}`;
};
function newFormulas(): Formulas {
  let known = new Map<string, string>();
  let version = 0;
  return {
    bump: () => void (version += 1),
    of: (ref) => (ref.kind === 'species' ? known.get(ref.id) : undefined),
    learn(state, sync) {
      const next = new Map<string, string>();
      for (const id of Object.keys(state.records.species)) {
        const formula = derivedOf(state, id, version);
        if (formula !== undefined) next.set(id, formula);
      }
      const changed = [...new Set([...known.keys(), ...next.keys()])].filter((id) => known.get(id) !== next.get(id));
      known = next;
      sync.refresh(changed);
    },
  };
}

async function expectEqualToRebuild(rig: SearchRig, label: string, formulas?: Formulas): Promise<void> {
  formulas?.learn(rig.store.getState(), rig.sync);
  await rig.sync.flush();
  const state = rig.store.getState();
  const revision = rig.store.getRevision();
  const full = fullDocuments(state, revision, formulas?.of);
  const held = documentsOf(rig.engine());
  expect(held.map((d) => d.id), `${label}: which documents`).toEqual(full.map((d) => d.id));
  expect(held, `${label}: documents`).toEqual(full);
  expect(rig.engine().revision, `${label}: revision`).toBe(revision);
  const difference = firstDifference(rig.engine(), freshEngine(state, revision, formulas?.of), queriesOf(full, Object.keys(state.records.exam_version)));
  expect(difference, `${label}: answers`).toBeUndefined();
  expect(rig.sync.status(), label).toMatchObject({ state: 'idle', queued: 0, backlog: 0 });
}

async function walk(rig: SearchRig, intents: readonly SearchIntent[], other: ReturnType<typeof searchStateOf>, every: number, formulas?: Formulas): Promise<{ applied: number; kinds: Set<string> }> {
  const ctx = testContext(23);
  let applied = 0;
  let replaced = false;
  const kinds = new Set<string>();
  for (const [i, intent] of intents.entries()) {
    const resolved = resolveSearchIntent(rig.store.getState(), intent, ctx);
    if (resolved === 'undo') {
      if (rig.store.undo()?.ok === true) kinds.add('undo');
    } else if (resolved === 'redo') {
      if (rig.store.redo()?.ok === true) kinds.add('redo');
    } else if (resolved === 'replace') {
      if (!replaced && rig.store.replaceState(other, 'import').ok) {
        replaced = true;
        kinds.add('replace');
      }
    } else if (resolved !== undefined) {
      if (rig.store.dispatch(resolved).ok) {
        applied += 1;
        kinds.add(intent.op);
      }
    }
    if (i % every === every - 1) {
      if (i % 3 === 1) formulas?.bump();
      await expectEqualToRebuild(rig, `step ${i} (${intent.op})`, formulas);
    }
  }
  await expectEqualToRebuild(rig, 'after the sequence', formulas);
  return { applied, kinds };
}

describe('P-07 incremental search index ≡ full rebuild after random command sequences', () => {
  it('commits, curriculum edits, undo, redo and a replaceState: documents, order of hits, scores', async () => {
    await fc.assert(
      fc.asyncProperty(smallParamsArb, searchIntentsArb(24), fc.integer({ min: 1, max: 6 }), async (params, intents, every) => {
        const rig = searchRig(makeStore(searchStateOf(params)));
        await rig.boot();
        await walk(rig, intents, searchStateOf({ ...params, seed: params.seed + 1 }), every);
      }),
      { ...PARAMS, numRuns: Math.max(PARAMS.numRuns, 25) },
    );
  });

  it('derived formulas (step 5.1b): learned late and announced with refresh(ids), the index still equals a full rebuild, and formulas are really indexed', async () => {
    let withFormula = 0;
    await fc.assert(
      fc.asyncProperty(smallParamsArb, searchIntentsArb(24), fc.integer({ min: 1, max: 6 }), async (params, intents, every) => {
        const formulas = newFormulas();
        const rig = searchRig(makeStore(searchStateOf(params)), { derivedFormulaOf: formulas.of });
        formulas.learn(rig.store.getState(), rig.sync);
        await rig.boot();
        await walk(rig, intents, searchStateOf({ ...params, seed: params.seed + 1 }), every, formulas);
        withFormula += documentsOf(rig.engine()).filter((d) => d.derivedFormula !== undefined).length;
      }),
      { ...PARAMS, numRuns: Math.max(PARAMS.numRuns, 25) },
    );
    expect(withFormula).toBeGreaterThan(0);
  });

  it('the walk is not vacuous: every kind of edit is reached and applied, and documents really change', async () => {
    const reached = new Set<string>();
    let documentChanges = 0;
    // a fixed script first: redo is only possible straight after an undo, which random sequences rarely produce
    const script: SearchIntent[] = [
      { op: 'rename', a: 1, b: 2, c: 3 }, { op: 'undo', a: 0, b: 0, c: 0 }, { op: 'redo', a: 0, b: 0, c: 0 }, { op: 'alias_add', a: 2, b: 0, c: 4 },
      { op: 'tags', a: 3, b: 1, c: 2 }, { op: 'lifecycle', a: 4, b: 0, c: 0 }, { op: 'note', a: 5, b: 0, c: 6 }, { op: 'map_create', a: 1, b: 3, c: 0 },
      { op: 'relevance_create', a: 2, b: 1, c: 1 }, { op: 'coverage', a: 0, b: 1, c: 2 }, { op: 'prereq_field', a: 0, b: 0, c: 1 }, { op: 'families', a: 0, b: 1, c: 2 },
      { op: 'delete', a: 3, b: 0, c: 0 }, { op: 'replace', a: 0, b: 0, c: 0 },
    ];
    const scripted = searchRig(makeStore(searchStateOf({ species: 16, classes: 3, reagents: 3, reactions: 12, relationshipsPerReaction: 0.5, topics: 3, shape: 'dense', seed: 5 })));
    await scripted.boot();
    for (const kind of (await walk(scripted, script, searchStateOf({ species: 12, classes: 2, reagents: 2, reactions: 6, relationshipsPerReaction: 0, topics: 2, shape: 'chain', seed: 9 }), 1)).kinds) reached.add(kind);
    await fc.assert(
      fc.asyncProperty(searchIntentsArb(40), async (intents) => {
        const rig = searchRig(makeStore(searchStateOf({ species: 16, classes: 3, reagents: 3, reactions: 12, relationshipsPerReaction: 0.5, topics: 3, shape: 'dense', seed: 5 })));
        await rig.boot();
        const before = documentsOf(rig.engine());
        const { kinds } = await walk(rig, intents, searchStateOf({ species: 12, classes: 2, reagents: 2, reactions: 6, relationshipsPerReaction: 0, topics: 2, shape: 'chain', seed: 9 }), 8);
        for (const kind of kinds) reached.add(kind);
        if (JSON.stringify(documentsOf(rig.engine())) !== JSON.stringify(before)) documentChanges += 1;
      }),
      { numRuns: 20, seed: PARAMS.seed },
    );
    for (const op of ['rename', 'alias_add', 'tags', 'lifecycle', 'note', 'delete', 'map_create', 'relevance_create', 'coverage', 'prereq_field', 'families', 'undo', 'redo', 'replace']) {
      expect(reached.has(op), `${op} was reached`).toBe(true);
    }
    expect(documentChanges).toBeGreaterThan(5);
  });

  it('flushing after every step or only at the end gives the same index', async () => {
    await fc.assert(
      fc.asyncProperty(smallParamsArb, searchIntentsArb(16), async (params, intents) => {
        const state = searchStateOf(params);
        const other = searchStateOf({ ...params, seed: params.seed + 1 });
        const eager = searchRig(makeStore(state));
        const lazy = searchRig(makeStore(state));
        await eager.boot();
        await lazy.boot();
        await walk(eager, intents, other, 1);
        const ctx = testContext(23);
        let replaced = false;
        for (const intent of intents) {
          const resolved = resolveSearchIntent(lazy.store.getState(), intent, ctx);
          if (resolved === 'undo') lazy.store.undo();
          else if (resolved === 'redo') lazy.store.redo();
          else if (resolved === 'replace') {
            if (!replaced && lazy.store.replaceState(other, 'import').ok) replaced = true;
          } else if (resolved !== undefined) lazy.store.dispatch(resolved);
        }
        await lazy.sync.flush();
        expect(lazy.store.getState()).toEqual(eager.store.getState());
        expect(documentsOf(lazy.engine())).toEqual(documentsOf(eager.engine()));
      }),
      { numRuns: 15, seed: PARAMS.seed },
    );
  });
});
