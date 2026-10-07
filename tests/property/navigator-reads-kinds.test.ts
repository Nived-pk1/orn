/**
 * `ProjectionDefinition.readsKinds` of the navigator (step 5.4c, decision Q3), PROVED: random commands whose
 * ChangeSet touches only record kinds outside the list leave the projection identical (`sameProjection`: apart
 * from revision and key), under several requests, including expansion. The same walk shows the list is not
 * vacuous: commands that touch a listed kind do change it sometimes, and a mutation that drops a kind from the
 * list is caught (the test names the kind it would have missed).
 */
import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { navigatorProjection, sameProjection, UNCLASSIFIED_HUB_ID, type Projection, type ProjectionRequest } from '@/core/graph';
import { indexEngine, type ReadonlyIndexes } from '@/core/indexes';
import { RECORD_KINDS, type AnyRecord, type CanonicalState, type RecordKind } from '@/core/schema';
import type { CommandEnvelope } from '@/core/commands';
import { frozenStateOf, intentArb, smallParamsArb, resolveIntent, type Intent } from '@/test-support/arbitraries';
import { contextOf, requestOf } from '@/test-support/graph-state';
import { loadFixtureState } from '@/test-support/state-fixture';
import { withNavigatorAnchors } from '@/test-support/perf-kit';
import { freshStore, PARAMS, TIMEOUT_MS } from './harness';

vi.setConfig({ testTimeout: TIMEOUT_MS });

const READS = new Set<RecordKind>(navigatorProjection.readsKinds);
const OUTSIDE = RECORD_KINDS.filter((kind) => !READS.has(kind));

const TEXT_FIELDS = ['name', 'title', 'description', 'notes', 'label'] as const;

/** A commit that edits one record of a kind the navigator does not read (or deletes it, cascading as it must). */
function outsideIntent(state: CanonicalState, intent: Intent): CommandEnvelope | undefined {
  const records = OUTSIDE.flatMap((kind) => Object.values(state.records[kind] as Readonly<Record<string, AnyRecord>>)).sort((a, b) => (a.id < b.id ? -1 : 1));
  const target = records[intent.a % Math.max(1, records.length)];
  if (target === undefined) return undefined;
  const field = TEXT_FIELDS.find((name) => typeof (target as unknown as Record<string, unknown>)[name] === 'string');
  if (intent.c % 4 === 0 || field === undefined) return { label: `Delete ${target.id}`, commands: [{ type: 'record.delete', ref: { kind: target.kind, id: target.id } as never, mode: 'apply_cascade' }] };
  const text = (target as unknown as Record<string, string>)[field] as string;
  return { label: `Edit ${target.id}`, commands: [{ type: 'record.update', record: { ...target, [field]: `${text} (${intent.b})` } as AnyRecord }] };
}

function requestsOf(indexes: ReadonlyIndexes): ProjectionRequest[] {
  const hubs = [...new Set(indexes.anchors().map((anchor) => anchor.target.id))].sort();
  const expanded = [...hubs, UNCLASSIFIED_HUB_ID].map((nodeId) => ({ nodeId, direction: 'both' as const }));
  return [requestOf('navigator'), requestOf('navigator', { expansion: { expanded, collapsedEdgeIds: [] } })];
}

describe('navigator readsKinds', () => {
  it('declares only real record kinds, sorted, and leaves out some kinds', () => {
    expect([...READS]).toHaveLength(navigatorProjection.readsKinds?.length ?? -1);
    expect(navigatorProjection.readsKinds).toEqual([...(navigatorProjection.readsKinds ?? [])].sort());
    expect(OUTSIDE.length).toBeGreaterThan(5);
  });

  it('random commands that touch only kinds outside the list leave the projection identical', () => {
    let outsideOnly = 0;
    let listedChanged = 0;
    fc.assert(
      fc.property(smallParamsArb, fc.boolean(), fc.array(fc.tuple(intentArb, fc.boolean()), { minLength: 1, maxLength: 30 }), (params, useFixture, steps) => {
        // The generator makes no record of most kinds: some runs start from the maximal fixture (all 22 kinds).
        const initial = useFixture ? loadFixtureState('maximal-valid') : withNavigatorAnchors(frozenStateOf(params), 6);
        const { store, ctx } = freshStore(initial);
        let full: ReadonlyIndexes = indexEngine.build(initial, store.getRevision());
        let touched: RecordKind[] = [];
        store.subscribe((changes) => {
          full = indexEngine.apply(full, changes, store.getState());
          touched = [...changes.created, ...changes.updated, ...changes.deleted].map((ref) => ref.kind);
        });
        const project = (request: ProjectionRequest): Projection => navigatorProjection.build({ ...contextOf(store.getState()), indexes: full }, request);
        for (const [intent, outside] of steps) {
          const requests = requestsOf(full);
          const before = requests.map(project);
          const envelope = outside ? outsideIntent(store.getState(), intent) : resolveIntent(store.getState(), intent, ctx);
          touched = [];
          const result = envelope === undefined ? undefined : store.dispatch(envelope);
          if (result === undefined || !result.ok) continue;
          const after = requests.map(project);
          if (touched.every((kind) => !READS.has(kind))) {
            outsideOnly += touched.length === 0 ? 0 : 1;
            requests.forEach((_, i) => expect(sameProjection(before[i] as Projection, after[i] as Projection), `touched ${touched.join(',')}`).toBe(true));
          } else if (!sameProjection(before[0] as Projection, after[0] as Projection)) {
            listedChanged += 1;
          }
        }
      }),
      PARAMS,
    );
    expect(outsideOnly).toBeGreaterThan(5);
    expect(listedChanged).toBeGreaterThan(5);
  });
});
