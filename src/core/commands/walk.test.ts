/**
 * ADV-044: 200 mixed commands (edits, duplicates, merges, reorders, cascade deletes, invalid edits),
 * then undo all and redo all. Every step is checked against the state recorded when it was committed
 * (INV-27). Along the way rejected commands change nothing (INV-12), and incrementally maintained
 * indexes and findings equal a fresh build and a fresh `validateAll` (INV-18).
 */
import { describe, expect, it } from 'vitest';
import { coreIndexEngine } from '../indexes/engine';
import type { CanonicalState, RecordKind, RecordRef } from '../schema';
import { validator } from '../validation';
import { serializeDocument, stateToDocument } from '../dataset';
import { makeStore, mulberry32, recordIn, ref, testContext, withFields } from '../../test-support/command-kit';
import { duplicateRecord, mergeRecords, reorderItems } from './builders';
import type { CommandEnvelope } from './contracts';
import type { StoreHandle } from './store';

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function expectDerivedDataConsistent(store: StoreHandle): void {
  const state = store.getState();
  const fresh = coreIndexEngine.build(state, store.getRevision());
  const live = store.getIndexes();
  for (const table of Object.values(state.records)) {
    for (const record of Object.values(table)) {
      expect(live.referrersOf(record.id)).toEqual(fresh.referrersOf(record.id));
      expect(live.definersOf(record.id)).toEqual(fresh.definersOf(record.id));
      expect(live.linkersOf(record.id)).toEqual(fresh.linkersOf(record.id));
    }
  }
  expect([...store.findings.all()].sort(byId)).toEqual([...validator.validateAll(state, fresh)].sort(byId));
}

const bytes = (state: CanonicalState): string => {
  const result = serializeDocument(stateToDocument(state, { exportedAt: '2026-09-21T00:00:00.000Z', exportScope: 'full', generator: { app: 't', version: '0' } }));
  if (!result.ok) throw new Error('serialise failed');
  return result.text;
};

function planStep(store: StoreHandle, rng: () => number, ctx: ReturnType<typeof testContext>, created: RecordRef[]): CommandEnvelope | undefined {
  const state = store.getState();
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(rng() * items.length)] as T;
  const idsOf = (kind: RecordKind): string[] => Object.keys(state.records[kind]).sort();
  const op = Math.floor(rng() * 9);
  switch (op) {
    case 0:
    case 1: {
      const id = pick(idsOf('species'));
      const species = recordIn(state, 'species', id);
      return { label: `Note ${id}`, commands: [{ type: 'record.update', record: withFields(species, { notes: `note ${Math.floor(rng() * 1000)}` }) }] };
    }
    case 2: {
      const target = ref(pick(['species', 'reaction', 'class', 'concept', 'reagent'] as const), '');
      const id = pick(idsOf(target.kind));
      const built = duplicateRecord(state, { ...target, id } as RecordRef, ctx);
      if (built.ok) created.push(built.envelope.selectionHint?.[0] as RecordRef);
      return built.ok ? built.envelope : undefined;
    }
    case 3: {
      const live = created.filter((r) => Object.hasOwn(state.records[r.kind], r.id));
      if (live.length === 0) return undefined;
      const victim = pick(live);
      return { label: `Delete ${victim.id}`, commands: [{ type: 'record.delete', ref: victim, mode: 'apply_cascade' }] };
    }
    case 4: {
      const twins = created.filter((r) => r.kind === 'species' && Object.hasOwn(state.records.species, r.id));
      if (twins.length === 0) return undefined;
      const built = mergeRecords(state, pick(twins), ref('species', 'spc_max-propanone'));
      return built.ok ? built.envelope : undefined;
    }
    case 5: {
      const id = pick(idsOf('reaction'));
      const reaction = recordIn(state, 'reaction', id) as unknown as { participants: { id: string }[] };
      const order = reaction.participants.map((p) => p.id);
      for (let i = order.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [order[i], order[j]] = [order[j] as string, order[i] as string];
      }
      const built = reorderItems(state, { ref: ref('reaction', id), field: 'participants', orderedIds: order });
      return built.ok ? built.envelope : undefined;
    }
    case 6: {
      const id = pick(idsOf('species'));
      const species = recordIn(state, 'species', id);
      return { label: 'Invalid', commands: [{ type: 'record.update', record: withFields(species, { classIds: ['cls_does-not-exist'] }) }] };
    }
    case 7: {
      const kind = pick(['concept', 'reference', 'view_preset', 'topic_mapping', 'exam_relevance'] as const);
      const ids = idsOf(kind);
      if (ids.length === 0) return undefined;
      return { label: `Delete ${kind}`, commands: [{ type: 'record.delete', ref: ref(kind, pick(ids)), mode: 'apply_cascade' }] };
    }
    default:
      return { label: 'Title', commands: [{ type: 'meta.update', meta: { ...state.meta, title: `Dataset ${Math.floor(rng() * 100)}` } }] };
  }
}

describe.each([1, 2, 3])('ADV-044 random walk (seed %i)', (seed) => {
  it('200 mixed commands, undo all, redo all: exact states at every step', () => {
    const store = makeStore();
    const rng = mulberry32(seed * 7919);
    const ctx = testContext(seed);
    const created: RecordRef[] = [];
    const initial = store.getState();
    const snapshots: CanonicalState[] = [initial];
    let rejected = 0;

    for (let step = 0; step < 200; step += 1) {
      const command = planStep(store, rng, ctx, created);
      if (command === undefined) continue;
      const before = store.getState();
      const revision = store.getRevision();
      const findingsBefore = store.findings.all();
      const result = store.dispatch(command);
      if (result.ok) {
        snapshots.push(store.getState());
        expect(store.getRevision()).toBe(revision + 1);
      } else {
        rejected += 1;
        expect(store.getState()).toBe(before);
        expect(store.getRevision()).toBe(revision);
        expect(store.findings.all()).toEqual(findingsBefore);
      }
      if (step % 40 === 39) expectDerivedDataConsistent(store);
    }
    expect(snapshots.length).toBeGreaterThan(60);
    expect(rejected).toBeGreaterThan(0);
    expect(store.findings.all({ severity: 'error' })).toEqual([]);
    expectDerivedDataConsistent(store);

    const final = store.getState();
    const commits = snapshots.length - 1;
    for (let i = commits; i > 0; i -= 1) {
      const result = store.undo();
      expect(result?.ok).toBe(true);
      expect(store.getState()).toEqual(snapshots[i - 1]);
    }
    expect(store.canUndo()).toBe(false);
    expect(bytes(store.getState())).toBe(bytes(initial));
    expectDerivedDataConsistent(store);

    for (let i = 1; i <= commits; i += 1) {
      const result = store.redo();
      expect(result?.ok).toBe(true);
      expect(store.getState()).toEqual(snapshots[i]);
    }
    expect(store.canRedo()).toBe(false);
    expect(bytes(store.getState())).toBe(bytes(final));
    expectDerivedDataConsistent(store);
    expect(store.getRevision()).toBe(3 * commits);
  }, 30_000); // 200 commands + full undo/redo with deep-equality at every step; ~2 s alone, >5 s when suites run in parallel
});
