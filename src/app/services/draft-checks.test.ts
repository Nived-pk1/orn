/**
 * The draft checks (step 6.2a, part 2): the dry run over a real compute replica, the structure checks over real RDKit. Answers carry
 * the draft version; a worker that cannot answer is a value in words.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import type { Species } from '@/core/schema';
import { realChecks, realChemPort } from '@/test-support/l4-real-kit';
import { loadFixtureState } from '@/test-support/state-fixture';
import { createComputeHandlers } from '@/workers/compute';
import type { ReplicaSync } from '@/workers/compute';
import type { ChemService } from '@/workers/chem';
import { createDraftChecks, requestOfDraft } from './draft-checks';

const MAX = loadFixtureState('maximal-valid');
const WATER = MAX.records.species['spc_max-water'] as Species;
const store = createCanonicalStore({ initial: MAX, revision: 0, validateInitial: false });

function syncOver(handlers: ReturnType<typeof createComputeHandlers>, state: 'in_sync' | 'down' = 'in_sync'): ReplicaSync {
  return {
    client: {
      checkDraft: async (params: never) => ({ ok: true, value: await handlers.api.checkDraft(params, {} as never) }),
    },
    status: () => ({ state }),
    settled: async () => ({ state }),
  } as unknown as ReplicaSync;
}

let chem: Pick<ChemService, 'checkSpecies' | 'matches'>;
beforeAll(async () => {
  const port = realChemPort(await realChecks());
  chem = { checkSpecies: port.checkSpecies, matches: port.matches, checkMechanism: port.checkMechanism } as never;
});

describe('dryRun', () => {
  it('answers the draft findings for the version asked (a dangling class gets REF-001), the replica untouched', async () => {
    const handlers = createComputeHandlers();
    handlers.replica.load(MAX, store.getRevision());
    const before = handlers.replica.snapshot().state;
    const checks = createDraftChecks({ store, sync: () => syncOver(handlers), chem });
    const answer = await checks.dryRun('species', { ...WATER, id: 'spc_draft', classIds: ['cls_nope'] }, 7);
    expect(answer).toMatchObject({ version: 7, state: 'checked' });
    expect(answer.state === 'checked' && answer.findings.some((f) => f.ruleId === 'REF-001')).toBe(true);
    expect(handlers.replica.snapshot().state).toBe(before);
  });

  it('says in words that the worker is down, and when there is none', async () => {
    const handlers = createComputeHandlers();
    const down = await createDraftChecks({ store, sync: () => syncOver(handlers, 'down'), chem }).dryRun('species', WATER, 1);
    expect(down).toMatchObject({ version: 1, state: 'unavailable' });
    expect(down.state === 'unavailable' && down.message).toMatch(/Save still checks/);
    expect(await createDraftChecks({ store, sync: () => undefined, chem }).dryRun('species', WATER, 2)).toMatchObject({ version: 2, state: 'unavailable' });
  });

  it('waits once for a replica that is behind, then asks again', async () => {
    const handlers = createComputeHandlers();
    handlers.replica.load(MAX, store.getRevision() + 1); // behind the store: stale
    let settled = 0;
    const sync = { ...syncOver(handlers), settled: async () => { settled += 1; handlers.replica.load(MAX, store.getRevision()); return { state: 'in_sync' }; } } as unknown as ReplicaSync;
    const answer = await createDraftChecks({ store, sync: () => sync, chem }).dryRun('species', WATER, 3);
    expect(settled).toBe(1);
    expect(answer.state).toBe('checked');
  });
});

describe('structure checks', () => {
  const checks = () => createDraftChecks({ store, sync: () => undefined, chem });

  it('CHEM-001 arrives for an invalid SMILES, linked to the structure', async () => {
    const answer = await checks().structure('species', { ...WATER, structure: { format: 'smiles', value: 'C1CC' } }, 4);
    expect(answer).toMatchObject({ version: 4, state: 'checked' });
    expect(answer.state === 'checked' && answer.findings.map((f) => [f.ruleId, f.path])).toContainEqual(['CHEM-001', 'structure']);
  });

  it('CHEM-003 arrives when the entered formula does not match', async () => {
    const answer = await checks().structure('species', { ...WATER, structure: { format: 'smiles', value: 'CCO' }, formula: 'C3H8O' }, 5);
    expect(answer.state === 'checked' && answer.findings.some((f) => f.ruleId === 'CHEM-003')).toBe(true);
  });

  it('a draft without a structure has nothing to check; a draft that is not yet a record is still checked piece by piece', async () => {
    expect(await checks().structure('species', { ...WATER, structure: undefined }, 6)).toEqual({ version: 6, state: 'none' });
    const partial = await checks().structure('species', { id: 'spc_x', structure: { format: 'smiles', value: 'C1CC' } }, 8);
    expect(partial.state === 'checked' && partial.findings.some((f) => f.ruleId === 'CHEM-001')).toBe(true);
  });

  it('a chemistry worker that cannot answer is said in words, never a CHEM-001', async () => {
    const dead = { checkSpecies: async () => ({ ok: false, reason: 'unavailable', error: 'the structure toolkit is not available' }), matches: async () => ({ ok: false, reason: 'unavailable', error: 'x' }) } as unknown as Pick<ChemService, 'checkSpecies' | 'matches'>;
    const answer = await createDraftChecks({ store, sync: () => undefined, chem: dead }).structure('species', { ...WATER, structure: { format: 'smiles', value: 'CCO' } }, 9);
    expect(answer).toMatchObject({ version: 9, state: 'unavailable' });
    expect(answer.state === 'unavailable' && answer.message).toMatch(/not checked/);
  });

  it('suggests a class whose SMARTS the structure matches and the draft does not list (CHEM-007), never adding it', async () => {
    const draft = { ...WATER, classIds: [], structure: { format: 'smiles', value: 'CCO' } };
    const withSmarts = { ...MAX, records: { ...MAX.records, class: Object.fromEntries(Object.entries(MAX.records.class).map(([id, c]) => [id, id === 'cls_max-alcohols' ? { ...c, generic: { ...(c.generic ?? {}), smarts: '[CX4][OX2H]' } } : c])) } };
    const local = createCanonicalStore({ initial: withSmarts as never, revision: 0, validateInitial: false });
    const answer = await createDraftChecks({ store: local, sync: () => undefined, chem }).structure('species', draft, 10);
    expect(answer.state === 'checked' && answer.suggestions).toContainEqual({ classId: 'cls_max-alcohols' });
    expect(draft.classIds).toEqual([]);
  });
});

describe('requestOfDraft', () => {
  it('takes each piece only when it is well-formed', () => {
    expect(requestOfDraft({ id: 'a', structure: { format: 'smiles', value: 'C' }, formula: 'CH4', charge: 1.5 })).toEqual({ id: 'a', structure: { format: 'smiles', value: 'C' }, formula: 'CH4' });
    expect(requestOfDraft({ id: 'a', structure: { format: 'smiles', value: '' } })).toBeUndefined();
    expect(requestOfDraft(null)).toBeUndefined();
  });
});

describe('structure checks of a mechanism draft (CHEM-008, step 6.5a part 4)', () => {
  const mechanism = (bondMaps: [number, number]) => ({
    kind: 'mechanism',
    id: 'mec_draft',
    name: 'Draft',
    aliases: [],
    mechanismClasses: [],
    conceptIds: [],
    tags: [],
    citations: [],
    provenance: { origin: 'user', createdAt: '2026-10-20T00:00:00.000Z', updatedAt: '2026-10-20T00:00:00.000Z' },
    review: { lifecycle: 'draft', status: 'unreviewed', reasons: [] },
    variants: [
      {
        id: 'mvr_draft-a',
        label: 'A',
        steps: [
          {
            id: 'mst_draft-a',
            stepKinds: [],
            species: [{ role: 'reactant', structure: { format: 'smiles', value: '[CH3:1][OH:2]' } }],
            bondsFormed: [],
            bondsBroken: [{ atoms: bondMaps, order: 1 }],
            electronMovements: [],
          },
        ],
      },
    ],
  });
  const checks = () => createDraftChecks({ store, sync: () => undefined, chem });

  it('a bond that names a map the step structures do not have gets CHEM-008 at the bond row', async () => {
    const answer = await checks().structure('mechanism', mechanism([1, 9]), 11);
    expect(answer).toMatchObject({ version: 11, state: 'checked' });
    expect(answer.state === 'checked' && answer.findings.map((f) => [f.ruleId, f.path])).toEqual([['CHEM-008', 'variants[0].steps[0].bondsBroken[0]']]);
  });

  it('maps that are all there give no finding; a draft that is not a mechanism yet is not checked', async () => {
    const fine = await checks().structure('mechanism', mechanism([1, 2]), 12);
    expect(fine.state === 'checked' && fine.findings).toEqual([]);
    expect(await checks().structure('mechanism', { kind: 'mechanism', id: 'mec_x' }, 13)).toEqual({ version: 13, state: 'none' });
  });
});
