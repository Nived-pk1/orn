/**
 * P-04 cascade deletes leave nothing dangling (INV-04) · P-05 rename changes no reference or ID ·
 * P-06 duplicate yields globally unique IDs · P-07 incremental indexes equal a full rebuild (INV-18) ·
 * P-08 undo^n / redo^n restore exact states (INV-27). docs/TEST_STRATEGY.md §4.
 */
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { referenceEngine } from '@/core/references';
import { coreIndexEngine } from '@/core/indexes/engine';
import { indexEngine } from '@/core/indexes/full';
import type { ReadonlyIndexes } from '@/core/indexes';
import { derivedSnapshot, idsOf } from '@/test-support/index-snapshot';
import { duplicateRecord } from '@/core/commands';
import type { CanonicalState } from '@/core/schema';
import {
  frozenStateOf,
  intentsArb,
  pickRecord,
  renamed,
  smallParamsArb,
  type Intent,
} from '@/test-support/arbitraries';
import { recordIn, testContext } from '@/test-support/command-kit';
import { allRecords, bytesOf, danglingReferences, errorFindings, freshStore, PARAMS, runIntents, TIMEOUT_MS } from './harness';

const deletes = (n: number): Intent[] => Array.from({ length: n }, (_, i) => ({ op: 'delete_cascade', a: i * 7 + 1, b: i * 13 + 5, c: 0 }));

vi.setConfig({ testTimeout: TIMEOUT_MS });

describe('P-04 apply_cascade leaves no dangling reference', () => {
  it('after every committed delete, and the oracle agrees with the validator', () => {
    fc.assert(
      fc.property(smallParamsArb, fc.array(fc.tuple(fc.nat(1_000_000), fc.nat(1_000_000)), { minLength: 1, maxLength: 12 }), (params, picks) => {
        const { store, ctx } = freshStore(frozenStateOf(params));
        let committed = 0;
        for (const [a, b] of picks) {
          const steps = runIntents(store, [{ op: 'delete_cascade', a, b, c: 0 }], ctx);
          const step = steps[0];
          if (step?.result?.ok) {
            committed += 1;
            expect(danglingReferences(step.after)).toEqual([]);
            expect(errorFindings(step.after)).toEqual([]);
          } else if (step?.result) {
            expect(step.after).toBe(step.before); // rejected: nothing changed (INV-12)
          }
        }
        expect(danglingReferences(store.getState())).toEqual([]);
        return committed >= 0;
      }),
      PARAMS,
    );
  });

  it('actually deletes things (the property is not vacuous)', () => {
    const { store, ctx } = freshStore(frozenStateOf({ species: 20, classes: 3, reagents: 3, reactions: 15, relationshipsPerReaction: 1, topics: 3, shape: 'dense', seed: 9 }));
    const steps = runIntents(store, deletes(30), ctx);
    expect(steps.filter((s) => s.result?.ok).length).toBeGreaterThan(5);
  });
});

describe('P-05 rename never changes any reference or ID', () => {
  it('only the renamed record differs; reverse references are identical', () => {
    fc.assert(
      fc.property(smallParamsArb, fc.nat(1_000_000), fc.nat(1_000_000), fc.string({ minLength: 1, maxLength: 30 }), (params, a, b, text) => {
        const { store } = freshStore(frozenStateOf(params));
        const before = store.getState();
        const target = pickRecord(before, a, b);
        if (target === undefined) return;
        const original = recordIn(before, target.kind, target.id);
        const next = renamed(original, `R ${text.replace(/[^\x20-\x7e]/g, '?').trim() || 'x'}`);
        if (next === undefined) return;
        const result = store.dispatch({ label: 'Rename', commands: [{ type: 'record.update', record: next }] });
        if (!result.ok) return; // e.g. blank after normalisation; a rejection changes nothing (covered by P-04)
        const after = store.getState();
        const idsBefore = allRecords(before).map((r) => r.id).sort();
        expect(allRecords(after).map((r) => r.id).sort()).toEqual(idsBefore);
        const refs = (state: CanonicalState) =>
          allRecords(state).filter((r) => r.id !== target.id).map((r) => [r.id, referenceEngine.extract(r).map((e) => `${e.path}=${e.targetId}`)]);
        expect(refs(after)).toEqual(refs(before));
        expect(referenceEngine.extract(next)).toEqual(referenceEngine.extract(original));
        const rebuilt = coreIndexEngine.build(after, 0);
        const old = coreIndexEngine.build(before, 0);
        for (const id of idsBefore) expect(rebuilt.referrersOf(id)).toEqual(old.referrersOf(id));
      }),
      PARAMS,
    );
  });
});

describe('P-06 duplicate produces globally unique record and nested IDs', () => {
  it('every ID (record and nested) in the result is unique across the dataset', () => {
    fc.assert(
      fc.property(smallParamsArb, fc.array(fc.tuple(fc.nat(1_000_000), fc.nat(1_000_000)), { minLength: 1, maxLength: 6 }), (params, picks) => {
        const { store } = freshStore(frozenStateOf(params));
        const ctx = testContext(5);
        for (const [a, b] of picks) {
          const state = store.getState();
          const target = pickRecord(state, a, b);
          if (target === undefined) continue;
          const built = duplicateRecord(state, target, ctx);
          if (!built.ok) continue;
          const result = store.dispatch(built.envelope);
          if (!result.ok) continue;
          const ids = allRecords(store.getState()).flatMap((r) => [r.id, ...referenceEngine.nestedIds(r).map((n) => n.id)]);
          expect(new Set(ids).size).toBe(ids.length);
          const copy = built.envelope.selectionHint?.[0];
          expect(copy?.id).not.toBe(target.id);
        }
      }),
      PARAMS,
    );
  });
});

let p07Commits = 0;
let p08Commits = 0;

describe('P-07 incremental indexes equal a full rebuild (INV-18)', () => {
  it('after random command sequences', () => {
    fc.assert(
      fc.property(smallParamsArb, intentsArb(30), (params, intents) => {
        const { store, ctx } = freshStore(frozenStateOf(params));
        // The cross-record indexes (step 2.1) follow the store through its ChangeSets, undo included.
        let full: ReadonlyIndexes = indexEngine.build(store.getState(), store.getRevision());
        store.subscribe((changes) => {
          full = indexEngine.apply(full, changes, store.getState());
        });
        p07Commits += runIntents(store, intents, ctx).filter((s) => s.result?.ok).length;
        const universe = idsOf(store.getState());
        expect(derivedSnapshot(full, universe)).toEqual(derivedSnapshot(indexEngine.build(store.getState(), store.getRevision()), universe));
        for (let i = 0; i < 3 && store.canUndo(); i += 1) {
          store.undo();
          for (const id of idsOf(store.getState())) universe.add(id);
          expect(derivedSnapshot(full, universe)).toEqual(derivedSnapshot(indexEngine.build(store.getState(), store.getRevision()), universe));
        }
        const state = store.getState();
        const fresh = coreIndexEngine.build(state, store.getRevision());
        const live = store.getIndexes();
        for (const record of allRecords(state)) {
          expect(live.get(record.id)).toBe(record);
          expect(live.referrersOf(record.id)).toEqual(fresh.referrersOf(record.id));
          expect(live.definersOf(record.id)).toEqual(fresh.definersOf(record.id));
          expect(live.linkersOf(record.id)).toEqual(fresh.linkersOf(record.id));
          if (record.kind === 'class') expect(live.classAncestors(record.id)).toEqual(fresh.classAncestors(record.id));
        }
      }),
      PARAMS,
    );
    expect(p07Commits).toBeGreaterThan(20);
  });
});

describe('P-08 undo^n and redo^n restore exact states (INV-27)', () => {
  it('undo all returns to the initial bytes; redo all to the final bytes; each step matches its snapshot', () => {
    fc.assert(
      fc.property(smallParamsArb, intentsArb(30), (params, intents) => {
        const initial = frozenStateOf(params);
        const { store, ctx } = freshStore(initial);
        const snapshots: CanonicalState[] = [initial];
        for (const step of runIntents(store, intents, ctx)) if (step.result?.ok) snapshots.push(step.after);
        p08Commits += snapshots.length - 1;
        const final = store.getState();
        for (let i = snapshots.length - 1; i > 0; i -= 1) {
          expect(store.undo()?.ok).toBe(true);
          expect(store.getState()).toEqual(snapshots[i - 1]);
        }
        expect(store.canUndo()).toBe(false);
        expect(bytesOf(store.getState())).toBe(bytesOf(initial));
        for (let i = 1; i < snapshots.length; i += 1) {
          expect(store.redo()?.ok).toBe(true);
          expect(store.getState()).toEqual(snapshots[i]);
        }
        expect(store.canRedo()).toBe(false);
        expect(bytesOf(store.getState())).toBe(bytesOf(final));
        expect(errorFindings(store.getState())).toEqual([]);
      }),
      PARAMS,
    );
    expect(p08Commits).toBeGreaterThan(20);
  });
});
