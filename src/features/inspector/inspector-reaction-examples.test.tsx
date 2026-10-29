// @vitest-environment jsdom
/**
 * 7.2b A6: a GENERIC reaction lists its specific examples ("Examples (n)": one link per reaction pointing at it with `instanceOfId`, in
 * folded-name order); a specific reaction shows "Example of <generic>". Over the maximal fixture (one generic Grignard reaction, one example).
 */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDerivedIndexes } from '@/app/services/derived-indexes';
import { createCanonicalStore } from '@/core/commands';
import { deserializeDocument, documentToState } from '@/core/dataset';
import type { CanonicalState, Reaction } from '@/core/schema';
import { fakeLayout } from '@/test-support/inspector-kit';
import { manualTimers } from '@/test-support/navigator-kit';
import { createFamilyStore, createInspectorStore, createPanelsStore, createSelectionStore } from '@/ui/state';
import type { InspectorHost, InspectorPorts } from './contracts';
import { Inspector } from './inspector';
import { loadOtherViews } from './lazy-views';

afterEach(cleanup);
beforeAll(fakeLayout);
beforeAll(async () => {
  await loadOtherViews();
});

const parsed = deserializeDocument(readFileSync(resolve(process.cwd(), 'data/fixtures/schema/v2/maximal-valid.orn.json'), 'utf8'));
if (!parsed.ok) throw new Error('the maximal fixture does not load');
const loaded = documentToState(parsed.document);
if (!loaded.ok) throw new Error('duplicate IDs in the maximal fixture');
const base: CanonicalState = loaded.state;
const GENERIC = 'rxn_max-grignard-ketone-generic';
const EXAMPLE = 'rxn_max-grignard-propanone';

function show(id: string, extra: readonly Reaction[] = []): void {
  const reaction = { ...base.records.reaction } as Record<string, Reaction>;
  for (const one of extra) reaction[one.id] = one;
  const state = { ...base, records: { ...base.records, reaction } } as CanonicalState;
  const store = createCanonicalStore({ initial: state, revision: 0, validateInitial: false });
  const indexes = createDerivedIndexes({ store, clock: { nowMs: () => 0 } });
  const inspector = createInspectorStore();
  const panels = createPanelsStore({ stored: undefined, mode: () => 'writable', save: () => Promise.resolve() }, { after: () => () => undefined });
  const ports: InspectorPorts = {
    store,
    indexes: { current: () => indexes.current() },
    findings: store.findings,
    l4: { statusOf: () => ({ state: 'none' }), derivedFormulaOf: () => undefined, subscribe: () => () => undefined, subscribeFormulas: () => () => undefined },
    timers: manualTimers(),
    ui: { inspector, selection: createSelectionStore(), family: createFamilyStore(), panels },
    log: () => undefined,
  };
  const host: InspectorHost = { openPane: () => undefined, edgeEnds: () => undefined, navigatorShown: false };
  render(<Inspector ports={ports} host={host} />);
  act(() => inspector.getState().open({ kind: 'reaction', id }));
}

describe('generic reactions and their examples', () => {
  it('a generic reaction lists its example as a link, with the count', () => {
    show(GENERIC);
    const examples = screen.getByRole('region', { name: 'Examples' });
    expect(within(examples).getByRole('heading', { name: 'Examples (1)' })).toBeTruthy();
    expect(examples.querySelector(`[data-record-id="${EXAMPLE}"]`)).not.toBeNull();
  });

  it('several examples come in folded-name order', () => {
    const example = base.records.reaction[EXAMPLE as never] as Reaction;
    const more = (id: string, name: string): Reaction => ({ ...example, id: id as never, name });
    show(GENERIC, [more('rxn_zz-example', 'zebra addition'), more('rxn_aa-example', 'Apple addition')]);
    const examples = screen.getByRole('region', { name: 'Examples' });
    expect(within(examples).getByRole('heading', { name: 'Examples (3)' })).toBeTruthy();
    const names = [...examples.querySelectorAll('[data-record-id]')].map((a) => a.textContent?.toLowerCase());
    expect(names).toEqual([...names].sort());
    expect(names[0]).toContain('apple');
  });

  it('a specific reaction shows "Example of" its generic one and has no Examples list', () => {
    show(EXAMPLE);
    expect(screen.queryByRole('region', { name: 'Examples' })).toBeNull();
    expect(screen.getByText('Example of')).toBeTruthy();
  });

  it('a generic reaction nothing points at has no Examples list', () => {
    show('rxn_max-isobutene-hydration');
    expect(screen.queryByRole('region', { name: 'Examples' })).toBeNull();
  });
});
