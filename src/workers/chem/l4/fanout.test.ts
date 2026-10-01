/**
 * What a change re-checks in the records that REFER to it (reviewer's follow-up b, step 4.3b review), counted against the scripted
 * worker: the reactions of a species whose structure changed, the species of a class whose SMARTS or parents changed, the cap of
 * 500 per change with the rest queued behind it (never dropped, shown as pending), and what is NOT queued.
 */
import { describe, expect, it } from 'vitest';
import { createFakeChem, createL4Rig, ref, speciesRecord, type FakeChem, type L4Rig, type Tables } from '@/test-support/l4-kit';
import { createL4Service, type L4Service } from './index';
import { RECHECK_CAP } from './fanout';

const table = (...records: { id: string }[]): Record<string, unknown> => Object.fromEntries(records.map((record) => [record.id, record]));
const species = (id: string, structure: string, extra = {}) => speciesRecord(id, structure, extra);
const reaction = (id: string, from: string, to: string, product = 1) => ({
  id,
  kind: 'reaction',
  participants: [{ id: 'prt_1', ref: { kind: 'species', id: from }, role: 'reactant', coefficient: 1 }],
  conditionVariants: [],
  outcomes: [{ id: 'out_1', conditionVariantIds: [], products: [{ id: 'prd_1', ref: { kind: 'species', id: to }, role: 'main', coefficient: product }] }],
});
const cls = (id: string, extra = {}) => ({ id, kind: 'class', parentIds: [], ...extra });

async function settled(initial: Tables): Promise<{ fake: FakeChem; r: L4Rig; service: L4Service }> {
  const fake = createFakeChem();
  const r = createL4Rig(fake, initial);
  const service = createL4Service({ ...r.ports, onError: (error) => r.errors.push(error) });
  service.checkAll();
  await service.flush();
  fake.log.length = 0;
  return { fake, r, service };
}
const speciesTable = (r: L4Rig) => r.state.current.records.species as unknown as Record<string, unknown>;
const l4 = (r: L4Rig) => r.findings.all({ level: 4 }).map((f) => `${f.ruleId} ${f.subject.id} ${f.path ?? ''}`);

describe('a species change re-checks the reactions that refer to it', () => {
  const base = (): Tables => ({
    species: table(species('spc_a', 'CCO'), species('spc_b', 'CC=O'), species('spc_z', 'C')),
    reaction: table(reaction('rxn_1', 'spc_a', 'spc_b'), reaction('rxn_other', 'spc_z', 'spc_z')),
  });

  it('a structure edit re-checks its reaction (and not an unrelated one), once; the reaction was not edited', async () => {
    const { fake, r, service } = await settled(base());
    service.onChange(r.commit({ species: { ...speciesTable(r), spc_a: species('spc_a', 'CCCO') } }, { updated: [ref('species', 'spc_a')] }));
    expect(service.statusOf(ref('reaction', 'rxn_1'))).toEqual({ state: 'pending' });
    expect(service.statusOf(ref('reaction', 'rxn_other'))).toEqual({ state: 'checked', notCompared: [] });
    await service.flush();
    expect(fake.log.map((c) => `${c.method} ${c.ids.join()}`)).toEqual(['checkSpecies spc_a', 'checkReaction outcomes[0]']);
    expect(service.stats()).toMatchObject({ referrerQueued: 1, maxQueuedAtOnce: 1, backlog: 0 });
  });

  it('an edit the reaction cannot see (a formula) is queued but not sent: its plan is the one already answered', async () => {
    const { fake, r, service } = await settled(base());
    service.onChange(r.commit({ species: { ...speciesTable(r), spc_a: species('spc_a', 'CCO', { formula: 'C2H6O' }) } }, { updated: [ref('species', 'spc_a')] }));
    await service.flush();
    expect(fake.log.map((c) => c.method)).toEqual(['checkSpecies']);
    expect(service.stats().referrerQueued).toBe(1);
    expect(service.statusOf(ref('reaction', 'rxn_1'))).toEqual({ state: 'checked', notCompared: [] });
  });

  it('a deleted species re-checks its reactions (the plan loses a side); a created one re-checks the reactions that named it', async () => {
    const { fake, r, service } = await settled(base());
    const { spc_b: _gone, ...rest } = speciesTable(r);
    void _gone;
    service.onChange(r.commit({ species: rest }, { deleted: [ref('species', 'spc_b')] }));
    await service.flush();
    expect(fake.log.map((c) => c.method)).toEqual([]); // the plan now has an unreadable side: it is "not compared", nothing to ask the worker
    expect(service.statusOf(ref('reaction', 'rxn_1'))).toMatchObject({ state: 'checked', notCompared: [{ ruleId: 'CHEM-005' }] });
    service.onChange(r.commit({ species: { ...rest, spc_b: species('spc_b', 'CC=O') } }, { created: [ref('species', 'spc_b')] }));
    await service.flush();
    expect(fake.log.map((c) => c.method)).toEqual(['checkSpecies', 'checkReaction']);
  });

  it('a mechanism is not queued by a species change (its checks read only its own embedded structures)', async () => {
    const mechanism = { id: 'mch_1', kind: 'mechanism', variants: [{ steps: [{ species: [{ structure: { format: 'smiles', value: 'CC' } }], bondsFormed: [{ atoms: [1, 2] }], bondsBroken: [], electronMovements: [] }] }] };
    const { fake, r, service } = await settled({ ...base(), mechanism: table(mechanism) });
    fake.log.length = 0;
    service.onChange(r.commit({ species: { ...speciesTable(r), spc_a: species('spc_a', 'CCCO') } }, { updated: [ref('species', 'spc_a')] }));
    await service.flush();
    expect(fake.log.map((c) => c.method)).toEqual(['checkSpecies', 'checkReaction']);
  });
});

describe('a class change re-checks the species that list it or a descendant', () => {
  const base = (): Tables => ({
    class: table(cls('cls_alcohol'), cls('cls_primary', { parentIds: ['cls_alcohol'] }), cls('cls_other')),
    species: table(
      species('spc_primary', 'CCO', { classIds: ['cls_primary'] }),
      species('spc_alcohol', 'CC(C)O', { classIds: ['cls_alcohol'] }),
      species('spc_other', 'CCC', { classIds: ['cls_other'] }),
      species('spc_none', 'C'),
    ),
  });
  const patch = (...path: (string | number)[]) => [{ op: 'replace', path: ['records', 'class', ...path], value: 'x' }] as never;

  it('a SMARTS edit: the species that list the class and its descendants, nobody else', async () => {
    const { fake, r, service } = await settled(base());
    service.onChange(r.commit({}, { updated: [ref('class', 'cls_alcohol')], patches: patch('cls_alcohol', 'generic', 'smarts') }));
    await service.flush();
    expect(fake.log.map((c) => `${c.method} ${c.ids.join()}`)).toContain('checkSpecies spc_alcohol,spc_primary');
    expect(fake.log.filter((c) => c.method === 'checkSpecies')).toHaveLength(1);
    expect(service.stats().referrerQueued).toBe(2);
  });

  it('a parent edit and a whole-record patch do the same; a name or a note does not', async () => {
    const { fake, r, service } = await settled(base());
    service.onChange(r.commit({}, { updated: [ref('class', 'cls_other')], patches: patch('cls_other', 'parentIds', 0) }));
    await service.flush();
    expect(fake.log.map((c) => c.ids.join())).toEqual(['spc_other']);
    fake.log.length = 0;
    service.onChange(r.commit({}, { updated: [ref('class', 'cls_alcohol')], patches: [...patch('cls_alcohol', 'names', 'canonical'), ...patch('cls_alcohol', 'notes'), ...patch('cls_alcohol', 'generic', 'label')] }));
    await service.flush();
    expect(fake.log).toEqual([]);
    expect(service.stats().referrerQueued).toBe(1);
  });

  it('a created or deleted class: the species that list it', async () => {
    const { fake, r, service } = await settled(base());
    service.onChange(r.commit({}, { deleted: [ref('class', 'cls_other')] }));
    await service.flush();
    expect(fake.log.map((c) => c.ids.join())).toEqual(['spc_other']);
  });
});

describe(`the cap: at most ${RECHECK_CAP} referrers queued per change, the rest behind them`, () => {
  const MANY = 1_200;
  const ids = Array.from({ length: MANY }, (_, i) => `rxn_${String(i).padStart(4, '0')}`);

  it('queues 500, keeps 700 pending in order, drops none, and ends with every reaction re-checked', async () => {
    expect(RECHECK_CAP).toBe(500);
    const reactions = table(...ids.map((id) => reaction(id, 'spc_a', 'spc_b', 2)));
    const { fake, r, service } = await settled({ species: table(species('spc_a', 'CCO'), species('spc_b', 'CC=O')), reaction: reactions });
    expect(l4(r)).toHaveLength(MANY); // every reaction is unbalanced in the scripted worker
    service.onChange(r.commit({ species: { ...speciesTable(r), spc_a: species('spc_a', 'CCCO') } }, { updated: [ref('species', 'spc_a')] }));
    expect(service.stats()).toMatchObject({ referrerQueued: MANY, maxQueuedAtOnce: RECHECK_CAP, backlog: MANY - RECHECK_CAP });
    expect(service.statusOf(ref('reaction', ids[0] as string))).toEqual({ state: 'pending' });
    expect(service.statusOf(ref('reaction', ids[MANY - 1] as string))).toEqual({ state: 'pending' }); // behind the cap, still shown as pending
    // one of those waiting is deleted meanwhile: it leaves the backlog, the rest stay
    const { [ids[MANY - 1] as string]: _gone, ...left } = r.state.current.records.reaction as unknown as Record<string, unknown>;
    void _gone;
    service.onChange(r.commit({ reaction: left }, { deleted: [ref('reaction', ids[MANY - 1] as string)] }));
    expect(service.stats().backlog).toBe(MANY - RECHECK_CAP - 1);
    expect(service.statusOf(ref('reaction', ids[MANY - 1] as string))).toEqual({ state: 'none' });
    await service.flush();
    expect(service.stats().backlog).toBe(0);
    const calls = fake.log.filter((c) => c.method === 'checkReaction');
    expect(calls.every((c) => c.items <= 32)).toBe(true);
    expect(calls.reduce((sum, c) => sum + c.items, 0)).toBe(MANY - 1);
    for (const id of ids.slice(0, MANY - 1)) expect(service.statusOf(ref('reaction', id)), id).toEqual({ state: 'checked', notCompared: [] });
    expect(r.errors).toEqual([]);
  });

  it('two changes each queue their own first 500 (the cap is per change, not a shared budget)', async () => {
    const reactions = table(...ids.map((id) => reaction(id, 'spc_a', 'spc_b')));
    const { r, service } = await settled({ species: table(species('spc_a', 'CCO'), species('spc_b', 'CC=O')), reaction: reactions });
    service.onChange(r.commit({ species: { ...speciesTable(r), spc_a: species('spc_a', 'CCCO') } }, { updated: [ref('species', 'spc_a')] }));
    service.onChange(r.commit({ species: { ...speciesTable(r), spc_b: species('spc_b', 'CCC=O') } }, { updated: [ref('species', 'spc_b')] }));
    // the second change's referrers were already queued or waiting: nothing is counted twice
    expect(service.stats()).toMatchObject({ referrerQueued: MANY, maxQueuedAtOnce: RECHECK_CAP, backlog: MANY - RECHECK_CAP });
    await service.flush();
    expect(service.stats().backlog).toBe(0);
  });
});
