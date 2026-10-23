/**
 * The merge dialog's port (step 6.8a, D3) over the maximal fixture: candidates of the same kind by name, the core's preview, the species
 * rule (two structures that are NOT the same compound refuse the merge in words; the chem worker not answering is said, never read as
 * "the same"), and the merge as one dispatched envelope.
 */
import { describe, expect, it, vi } from 'vitest';
import { coreIndexEngine } from '@/core/indexes/engine';
import type { CanonicalState, RecordRef, Species } from '@/core/schema';
import { makeStore, recordIn, ref } from '@/test-support/command-kit';
import { loadFixtureState } from '@/test-support/state-fixture';
import { createMergePort } from './merge-port';

const B = ref('species', 'spc_max-diethyl-ether');
const NOW = '2026-10-23T10:00:00.000Z';

function rig(twin: Partial<Species>, chem?: Parameters<typeof createMergePort>[0]['chem']) {
  const base = loadFixtureState('maximal-valid');
  const original = recordIn<Species>(base, 'species', B.id);
  const a = { ...original, id: 'spc_twin-ether', names: { ...original.names, canonical: 'Ethoxyethane (twin)', common: [], aliases: [] }, ...twin } as Species;
  const state = { ...base, records: { ...base.records, species: { ...base.records.species, [a.id]: a } } } as unknown as CanonicalState;
  const store = makeStore(state);
  const port = createMergePort({ state: () => store.getState(), indexes: () => coreIndexEngine.build(store.getState()), dispatch: (envelope) => store.dispatch(envelope), chem, now: () => NOW });
  return { port, store, a, original };
}
const answer = (smiles: Record<string, string | undefined>) =>
  ({
    checkSpecies: vi.fn(async (requests: readonly { id: string }[]) => ({ ok: true as const, value: { results: requests.map((request) => ({ id: request.id, status: { state: 'checked' }, ...(smiles[request.id] === undefined ? {} : { canonicalSmiles: smiles[request.id] }) })) } })),
  }) as never;

describe('candidates', () => {
  it('lists records of the same kind by name, never the record itself, at most 20', () => {
    const { port, original } = rig({});
    const found = port.candidates('species', original.names.canonical.slice(0, 4), 'spc_twin-ether');
    expect(found.map((one) => one.ref.id)).toContain(B.id);
    expect(found.map((one) => one.ref.id)).not.toContain('spc_twin-ether');
    expect(found.every((one) => one.ref.kind === 'species')).toBe(true);
    expect(port.candidates('species', '', 'none').length).toBeLessThanOrEqual(20);
  });
});

describe('species structures', () => {
  it('the same structure text is the same compound: no check is needed and the preview is ready', async () => {
    const { port, a } = rig({});
    const view = await port.preview(a, B);
    expect(view.ok).toBe(true);
  });
  it('different structures that the engine reads as different compounds REFUSE the merge in words', async () => {
    const chem = answer({ 'spc_twin-ether': 'CCO', [B.id]: 'CCOCC' });
    const { port, a } = rig({ structure: { format: 'smiles', value: 'OCC' } }, chem);
    expect(await port.preview(a, B)).toEqual({ ok: false, message: 'These structures are different compounds' });
    expect(await port.run(a, B, {})).toEqual({ ok: false, message: 'These structures are different compounds' });
  });
  it('different spellings of the SAME compound merge, and the structure is a choice', async () => {
    const chem = answer({ 'spc_twin-ether': 'CCOCC', [B.id]: 'CCOCC' });
    const { port, a } = rig({ structure: { format: 'smiles', value: 'C(C)OCC' } }, chem);
    const view = await port.preview(a, B);
    expect(view.ok && view.scalars.map((one) => one.path)).toContain('structure');
  });
  it('an engine that does not answer is said in words, never read as "the same"', async () => {
    const chem = { checkSpecies: vi.fn(async () => ({ ok: false as const, error: 'the engine is not ready' })) } as never;
    const { port, a } = rig({ structure: { format: 'smiles', value: 'OCC' } }, chem);
    const view = await port.preview(a, B);
    expect(view.ok).toBe(false);
    expect(!view.ok && view.message).toContain('could not be compared');
  });
  it('a species with no structure on one side needs no check', async () => {
    const { port, a } = rig({ structure: undefined });
    expect((await port.preview(a, B)).ok).toBe(true);
  });
});

describe('run', () => {
  it('dispatches ONE envelope; A is gone and the label is "merge A into B"', async () => {
    const { port, store, a } = rig({});
    const result = await port.run(a, B, {});
    expect(result).toEqual({ ok: true });
    expect(Object.hasOwn(store.getState().records.species, a.id)).toBe(false);
    expect(store.historyLabels().undo).toHaveLength(1);
    expect(store.historyLabels().undo[0]).toMatch(/^merge Ethoxyethane \(twin\) into /);
  });
  it('a kind that is not offered is refused in words and nothing changes', async () => {
    const { port, store } = rig({});
    const reaction = Object.values(store.getState().records.reaction)[0];
    const view = await port.preview(reaction, { kind: 'reaction', id: reaction?.id } as RecordRef);
    expect(view).toEqual({ ok: false, message: 'Merging reaction is not offered; delete the copy instead.' });
  });
});
