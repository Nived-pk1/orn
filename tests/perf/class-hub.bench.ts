/**
 * Class-hub commits (docs/PERFORMANCE_ARCHITECTURE.md §2, step 2.13): at the design tier in `hub_explosion`
 * every species lists class 0, so editing that class touches a record with ~1,400 species referrers (plus the
 * classes that hang under it). Whole-commit benches for the three edits an author makes to a class: rename,
 * notes, and moving it under another parent. Species still have an undeclared rule (SPC-006) and class
 * `peers` name every species listing a touched class, so this is measured before anything is changed for it.
 */
import { bench, describe } from 'vitest';
import { createCanonicalStore, type StoreHandle } from '@/core/commands';
import { withFields } from '@/test-support/command-kit';
import { buildIndexes, FAST_BENCH_OPTIONS, mostReferencedClass, tierState, withSpareClass } from '@/test-support/perf-kit';
import { must } from '@/test-support/state-fixture';
import type { AnyRecord } from '@/core/schema';

const SPARE_ROOT = 'cls_bench-spare-root';

describe('commit — class hub (design tier, hub_explosion: every species lists it)', () => {
  const generated = tierState('design', 'hub_explosion');
  const hub = mostReferencedClass(generated, buildIndexes(generated));
  const initial = withSpareClass(generated, hub, SPARE_ROOT);
  const classOf = (store: StoreHandle): AnyRecord & { names: { canonical: string }; parentIds: string[] } =>
    must(store.getState().records.class[hub.id]) as never;

  /** One accepted commit, or the benchmark would time a rejection. */
  const edit = (store: StoreHandle, n: number, fields: (record: ReturnType<typeof classOf>) => Record<string, unknown>): void => {
    const result = store.dispatch({ label: `class-hub-${n}`, commands: [{ type: 'record.update', record: withFields(classOf(store), fields(classOf(store))) }] });
    if (!result.ok) throw new Error(`class-hub edit rejected: ${result.error.code} ${result.error.message}`);
  };

  const renameStore = createCanonicalStore({ initial, validateInitial: false });
  const notesStore = createCanonicalStore({ initial, validateInitial: false });
  const parentStore = createCanonicalStore({ initial, validateInitial: false });
  let a = 0;
  let b = 0;
  let c = 0;

  bench(
    'dispatch: rename the class hub',
    () => {
      a += 1;
      edit(renameStore, a, (r) => ({ names: { ...r.names, canonical: `Class hub ${a}` } }));
    },
    FAST_BENCH_OPTIONS,
  );

  bench(
    'dispatch: edit the class hub notes',
    () => {
      b += 1;
      edit(notesStore, b, () => ({ notes: `A note, revision ${b}.` }));
    },
    FAST_BENCH_OPTIONS,
  );

  bench(
    'dispatch: move the class hub under another parent (and back)',
    () => {
      c += 1;
      edit(parentStore, c, () => ({ parentIds: c % 2 === 1 ? [SPARE_ROOT] : [] }));
    },
    FAST_BENCH_OPTIONS,
  );
});
