/**
 * Follower apply of ONE change message at the design tier (docs/IMPLEMENTATION_PLAN.md step 3.4, ADR-033;
 * PERFORMANCE_ARCHITECTURE.md §2 has no row for it, so these are informal). The parts are reported separately so our
 * own work is not confused with fake-indexeddb (whose reads cost far more than a real IndexedDB's):
 *  - read the changed rows: `readChanged` on fake-indexeddb, one read transaction. NOT our code.
 *  - L1 parse of those rows: one `parseRecord` each. Our code.
 *  - `applyRemote`: patches, ChangeSet, incremental indexes and `validateTouchedByRule` WITH the previous state
 *    (no ERROR gate). Our code, on the main thread until Phase 4.
 * A message costs read + L1 + applyRemote. "Ordinary edit" = one record. "Hub edit" = `replaceReferences` on the
 * design-tier "like water" hub (5,000 reactions, one species used by 1,000 of them): one transaction whose message
 * names ~1,000 records (the same two edits as persist.bench.ts). Each `applyRemote` call alternates between the
 * edited and the original rows so the store can be applied to forever; the revision advances by one each time.
 */
import { bench, describe } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import type { CanonicalState, RecordRef, AnyRecord, RecordKind } from '@/core/schema';
import { validator } from '@/core/validation';
import { withFields } from '@/test-support/command-kit';
import { buildIndexes, designTierHubState, FAST_BENCH_OPTIONS, leastReferencedSpecies, mostReferencedSpecies, SLOW_BENCH_OPTIONS } from '@/test-support/perf-kit';
import { freshAdapter, seedChangeSet } from '@/test-support/persistence-kit';
import { must } from '@/test-support/state-fixture';

const initial = designTierHubState();
const indexes = buildIndexes(initial);
const hub: RecordRef = mostReferencedSpecies(initial, indexes);
const other: RecordRef = leastReferencedSpecies(initial, indexes);

function editedState(build: (state: CanonicalState) => Parameters<ReturnType<typeof createCanonicalStore>['dispatch']>[0]) {
  const store = createCanonicalStore({ initial, revision: 1, validateInitial: false });
  let refs: RecordRef[] = [];
  store.subscribe((changes) => {
    refs = [...changes.created, ...changes.updated, ...changes.deleted];
  });
  const result = store.dispatch(build(initial));
  if (!result.ok) throw new Error(`bench setup commit rejected: ${result.error.code} ${result.error.message}`);
  if (result.changes.created.length + result.changes.deleted.length > 0) throw new Error('bench setup: the edit must only update records');
  return { after: store.getState(), refs };
}

const ordinary = editedState((state) => ({
  label: 'bench: edit one species',
  commands: [{ type: 'record.update', record: withFields(must(state.records.species[other.id]), { notes: 'bench edit' }) }],
}));
const hubEdit = editedState(() => ({ label: 'bench: merge hub', commands: [{ type: 'record.replaceReferences', from: hub, to: other }] }));

const recordOf = (state: CanonicalState, ref: RecordRef): AnyRecord => must((state.records[ref.kind as RecordKind] as Record<string, AnyRecord>)[ref.id]);
const rowsOf = (state: CanonicalState, refs: readonly RecordRef[]): AnyRecord[] => refs.map((ref) => recordOf(state, ref));

// Seeded once, outside every timed region: the database holds the whole design-tier state.
const t = freshAdapter({ initialRevision: 0 });
await t.adapter.writeChanges(seedChangeSet(initial, 1), initial);
const ordinaryIds = ordinary.refs.map((r) => r.id);
const hubIds = hubEdit.refs.map((r) => r.id);
const ordinaryRows = (await t.adapter.readChanged(ordinaryIds)).rows;
const hubRows = (await t.adapter.readChanged(hubIds)).rows;

const parseAll = (rows: readonly unknown[]): void => {
  for (const row of rows) {
    const parsed = validator.parseRecord((row as { kind: RecordKind }).kind, row);
    if (!parsed.ok) throw new Error('bench: a stored row failed L1');
  }
};

describe('follower apply (design tier, hub_explosion): read the changed rows on fake-indexeddb', () => {
  bench('read the changed rows, ordinary edit (1 row; fake-indexeddb, not our code)', async () => void (await t.adapter.readChanged(ordinaryIds)), FAST_BENCH_OPTIONS);
  bench('read the changed rows, hub edit (~1,000 rows; fake-indexeddb, not our code)', async () => void (await t.adapter.readChanged(hubIds)), SLOW_BENCH_OPTIONS);
});

describe('follower apply (design tier, hub_explosion): L1 parse of the rows read', () => {
  bench('L1 parse, ordinary edit (1 row)', () => parseAll(ordinaryRows), FAST_BENCH_OPTIONS);
  bench('L1 parse, hub edit (~1,000 rows)', () => parseAll(hubRows), FAST_BENCH_OPTIONS);
});

describe('follower apply (design tier, hub_explosion): applyRemote', () => {
  const follower = createCanonicalStore({ initial, revision: 1, readOnly: () => true });
  let revision = 1;
  let edited = false;
  const apply = (versions: { readonly before: AnyRecord[]; readonly after: AnyRecord[] }): void => {
    const upserts = edited ? versions.before : versions.after;
    edited = !edited;
    const result = follower.applyRemote({ fromRevision: revision, revision: revision + 1, upserts, deletedIds: [] });
    if (!result.ok) throw new Error(`bench: applyRemote refused: ${result.error.code} ${result.error.message}`);
    revision += 1;
  };
  const ordinaryVersions = { before: rowsOf(initial, ordinary.refs), after: rowsOf(ordinary.after, ordinary.refs) };

  bench('applyRemote, ordinary edit (our code: patches, incremental indexes, validateTouchedByRule)', () => apply(ordinaryVersions), FAST_BENCH_OPTIONS);

  // The hub edit has its own store so the two entries never see each other's state.
  const hubFollower = createCanonicalStore({ initial, revision: 1, readOnly: () => true });
  let hubRevision = 1;
  let hubEdited = false;
  const hubVersions = { before: rowsOf(initial, hubEdit.refs), after: rowsOf(hubEdit.after, hubEdit.refs) };
  bench(
    'applyRemote, hub edit (~1,000 records; our code: patches, incremental indexes, validateTouchedByRule)',
    () => {
      const upserts = hubEdited ? hubVersions.before : hubVersions.after;
      hubEdited = !hubEdited;
      const result = hubFollower.applyRemote({ fromRevision: hubRevision, revision: hubRevision + 1, upserts, deletedIds: [] });
      if (!result.ok) throw new Error(`bench: applyRemote refused: ${result.error.code} ${result.error.message}`);
      hubRevision += 1;
    },
    SLOW_BENCH_OPTIONS,
  );
});
