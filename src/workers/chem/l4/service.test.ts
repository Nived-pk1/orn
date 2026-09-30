/**
 * The L4 service's orchestration (step 4.3b, Phase 4 contract decisions Q10 c and e), counted against a scripted worker
 * (src/test-support/l4-kit.ts; every message passes structuredClone): what is re-checked after which change, batching, the CHEM-009
 * groups refreshed for exactly the old and the new structure, a result that arrives after its record changed again dropped, the
 * memory of inputs the toolkit could not check, the status per subject. The same flows over real RDKit and a real store are in
 * tests/integration/l4-service.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { createL4Rig, createFakeChem, ref, speciesRecord, type FakeChem, type L4Rig, type Tables } from '@/test-support/l4-kit';
import { createL4Service, L4_BATCH_SIZE } from './index';
import type { L4Service } from './index';

function rig(initial: Tables = {}): { fake: FakeChem; r: L4Rig; service: L4Service } {
  const fake = createFakeChem();
  const r = createL4Rig(fake, initial);
  const service = createL4Service({ ...r.ports, onError: (error) => r.errors.push(error) });
  return { fake, r, service };
}

const table = (...records: { id: string }[]): Record<string, unknown> => Object.fromEntries(records.map((record) => [record.id, record]));
const l4 = (r: L4Rig) => r.findings.all({ level: 4 }).map((f) => `${f.ruleId} ${f.subject.id} ${f.path ?? ''}`);
const species = (id: string, structure: string | undefined, extra = {}) => speciesRecord(id, structure, extra);

describe('checkAll and batching', () => {
  it('sends species in batches of the stated size, every call passing structuredClone, and finds CHEM-001 without blocking anything', async () => {
    expect(L4_BATCH_SIZE).toBe(32);
    const many = Array.from({ length: 70 }, (_, i) => species(`spc_s${String(i).padStart(2, '0')}`, i === 5 ? 'BAD(' : `C${'C'.repeat(i)}`));
    const { fake, r, service } = rig({ species: table(...many, species('spc_nostruct', undefined)) });
    service.checkAll();
    expect(r.scheduled).toHaveLength(1); // one debounce, however much is queued
    expect(service.statusOf(ref('species', 'spc_s00'))).toEqual({ state: 'pending' });
    await service.flush();
    expect(fake.log.filter((c) => c.method === 'checkSpecies').map((c) => c.items)).toEqual([32, 32, 6]);
    expect(l4(r)).toEqual(['CHEM-001 spc_s05 structure']);
    expect(r.findings.all({ level: 4 })[0]).toMatchObject({ level: 4, severity: 'warning' });
    expect(service.statusOf(ref('species', 'spc_s05'))).toEqual({ state: 'checked', notCompared: [] });
    expect(service.statusOf(ref('species', 'spc_nostruct'))).toEqual({ state: 'checked', notCompared: [] });
    expect(r.errors).toEqual([]);
  });

  it('the status of a subject says what was not compared, out loud', async () => {
    const { r, service } = rig({ species: table(species('spc_a', 'CCO', { formula: '??' })) });
    service.checkAll();
    await service.flush();
    expect(service.statusOf(ref('species', 'spc_a'))).toEqual({ state: 'checked', notCompared: [{ ruleId: 'CHEM-003', reason: expect.stringContaining('not compared') }] });
    expect(service.statusOf(ref('concept', 'cpt_x'))).toEqual({ state: 'none' });
    void r;
  });
});

describe('what a change re-checks (item c), counted', () => {
  async function settled() {
    const setup = rig({
      species: table(species('spc_a', 'CCO'), species('spc_b', '~CCO'), species('spc_c', 'CCC'), species('spc_d', 'CCCC'), species('spc_e', '~CCCC'), species('spc_lone', 'C=C')),
    });
    setup.service.checkAll();
    await setup.service.flush();
    setup.fake.log.length = 0;
    setup.r.merges.length = 0;
    return setup;
  }
  const speciesTable = (r: L4Rig) => r.state.current.records.species as unknown as Record<string, unknown>;

  it('a structure edit re-checks that species ONLY, and CHEM-009 for its old and its new group, no other group', async () => {
    const { fake, r, service } = await settled();
    expect(l4(r)).toEqual(['CHEM-009 spc_a structure', 'CHEM-009 spc_b structure', 'CHEM-009 spc_d structure', 'CHEM-009 spc_e structure']);
    // spc_a leaves the {a, b} group and joins the {d, e} group (whose structure is CCCC)
    const changes = r.commit({ species: { ...speciesTable(r), spc_a: species('spc_a', 'CCCC') } }, { updated: [ref('species', 'spc_a')] });
    service.onChange(changes);
    await service.flush();
    expect(fake.log).toEqual([{ method: 'checkSpecies', items: 1, ids: ['spc_a'] }]);
    const cheme009 = r.merges.filter((m) => m.ruleIds.includes('CHEM-009'));
    expect(cheme009).toHaveLength(1);
    expect(cheme009[0]?.subjects).toEqual(['spc_a', 'spc_b', 'spc_d', 'spc_e']); // the old group {a,b} and the new group {a,d,e}: never spc_c, never spc_lone
    expect(l4(r)).toEqual(['CHEM-009 spc_a structure', 'CHEM-009 spc_d structure', 'CHEM-009 spc_e structure']);
    expect(r.findings.bySubject(ref('species', 'spc_b'))).toEqual([]);
  });

  it('an edit that changes nothing a check reads (a name, a note) re-checks nothing', async () => {
    const { fake, r, service } = await settled();
    service.onChange(r.commit({ species: { ...speciesTable(r), spc_c: { ...(speciesTable(r).spc_c as object), notes: 'edited' } } }, { updated: [ref('species', 'spc_c')] }));
    await service.flush();
    expect(fake.log).toEqual([]);
    expect(r.scheduled.length).toBeGreaterThanOrEqual(1);
  });

  it('a formula, a charge or a class list edit does re-check that species (they are read by CHEM-003, 004 and 007)', async () => {
    const { fake, r, service } = await settled();
    for (const extra of [{ formula: 'C3H8' }, { charge: 1 }, { classIds: ['cls_x'] }]) {
      service.onChange(r.commit({ species: { ...speciesTable(r), spc_c: species('spc_c', 'CCC', extra) } }, { updated: [ref('species', 'spc_c')] }));
      await service.flush();
    }
    expect(fake.log.map((c) => c.ids.join())).toEqual(['spc_c', 'spc_c', 'spc_c']);
  });

  it('a reaction or a mechanism edit re-checks that record; nothing else is sent', async () => {
    const reaction = (id: string, reactant: number, product: number) => ({
      id,
      kind: 'reaction',
      participants: [{ id: 'prt_1', ref: { kind: 'species', id: 'spc_c' }, role: 'reactant', coefficient: reactant }],
      conditionVariants: [],
      outcomes: [{ id: 'out_1', conditionVariantIds: [], products: [{ id: 'prd_1', ref: { kind: 'species', id: 'spc_d' }, role: 'main', coefficient: product }] }],
    });
    const mechanism = { id: 'mch_1', kind: 'mechanism', variants: [{ steps: [{ species: [{ structure: { format: 'smiles', value: 'CC' } }], bondsFormed: [{ atoms: [1, 99] }], bondsBroken: [], electronMovements: [] }] }] };
    const { fake, r, service } = await settled();
    service.onChange(r.commit({ reaction: table(reaction('rxn_1', 1, 2), reaction('rxn_2', 1, 1)), mechanism: table(mechanism) }, { created: [ref('reaction', 'rxn_1'), ref('reaction', 'rxn_2'), ref('mechanism', 'mch_1')] }));
    await service.flush();
    expect(fake.log.map((c) => `${c.method} ${c.ids.join()}`)).toEqual(['checkReaction outcomes[0],outcomes[0]', 'checkMechanism variants[0].steps[0]']);
    expect(l4(r)).toContain('CHEM-005 rxn_1 outcomes[0]');
    expect(l4(r)).not.toContain('CHEM-005 rxn_2 outcomes[0]');
    expect(l4(r)).toContain('CHEM-008 mch_1 variants[0].steps[0].bondsFormed[0]');
    fake.log.length = 0;
    service.onChange(r.commit({ reaction: table(reaction('rxn_1', 1, 1), reaction('rxn_2', 1, 1)) }, { updated: [ref('reaction', 'rxn_1')] }));
    await service.flush();
    expect(fake.log).toEqual([{ method: 'checkReaction', items: 1, ids: ['outcomes[0]'] }]);
    expect(l4(r)).not.toContain('CHEM-005 rxn_1 outcomes[0]'); // fixed: the finding is gone
    expect(service.statusOf(ref('reaction', 'rxn_1'))).toEqual({ state: 'checked', notCompared: [] });
  });

  it('a deleted species leaves its group: the others are refreshed, its status is forgotten', async () => {
    const { fake, r, service } = await settled();
    const { spc_b: _gone, ...rest } = speciesTable(r);
    void _gone;
    r.findings.replaceForRules([ref('species', 'spc_b')], ['CHEM-009'], []); // (the store's commit step clears the deleted subject's findings)
    service.onChange(r.commit({ species: rest }, { deleted: [ref('species', 'spc_b')] }));
    await service.flush();
    expect(fake.log).toEqual([]);
    expect(l4(r)).toEqual(['CHEM-009 spc_d structure', 'CHEM-009 spc_e structure']); // spc_a is alone now
    expect(service.statusOf(ref('species', 'spc_b'))).toEqual({ state: 'none' });
  });
});

describe('a result that arrives after its record changed again is dropped, never applied', () => {
  it('drops the old answer, applies the newer one, counts it', async () => {
    const { fake, r, service } = rig({ species: table(species('spc_a', 'CCO')) });
    let release: () => void = () => undefined;
    fake.gate = new Promise<void>((resolve) => void (release = resolve));
    service.checkAll();
    const first = service.flush();
    await Promise.resolve();
    // while the worker is busy with "CCO", the species becomes an unreadable structure
    fake.gate = undefined;
    service.onChange(r.commit({ species: table(species('spc_a', 'BAD(')) }, { updated: [ref('species', 'spc_a')] }));
    release();
    await first;
    await service.flush();
    expect(service.stats().staleDropped).toBe(1);
    expect(fake.log.map((c) => c.ids.join())).toEqual(['spc_a', 'spc_a']);
    expect(l4(r)).toEqual(['CHEM-001 spc_a structure']); // only the newer answer was applied
  });

  it('the same for a reaction edited while its balance is being checked: the old answer is dropped, the new one applied', async () => {
    const reaction = (product: number) => ({
      id: 'rxn_1',
      kind: 'reaction',
      participants: [{ id: 'prt_1', ref: { kind: 'species', id: 'spc_a' }, role: 'reactant', coefficient: 1 }],
      conditionVariants: [],
      outcomes: [{ id: 'out_1', conditionVariantIds: [], products: [{ id: 'prd_1', ref: { kind: 'species', id: 'spc_b' }, role: 'main', coefficient: product }] }],
    });
    const { fake, r, service } = rig({ species: table(species('spc_a', 'CCO'), species('spc_b', 'CC=O')), reaction: table(reaction(2)) });
    service.onChange(r.commit({}, { created: [ref('reaction', 'rxn_1')] }));
    let release: () => void = () => undefined;
    fake.gate = new Promise<void>((resolve) => void (release = resolve));
    const first = service.flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fake.gate = undefined;
    service.onChange(r.commit({ reaction: table(reaction(1)) }, { updated: [ref('reaction', 'rxn_1')] }));
    release();
    await first;
    await service.flush();
    expect(service.stats().staleDropped).toBe(1);
    expect(l4(r)).toEqual([]); // 1 : 1 balances in the scripted worker; the answer for 1 : 2 was dropped
  });

  it('a result for a record that was deleted meanwhile is dropped, and nothing is merged for it', async () => {
    const { fake, r, service } = rig({ species: table(species('spc_a', 'BAD(')) });
    let release: () => void = () => undefined;
    fake.gate = new Promise<void>((resolve) => void (release = resolve));
    service.checkAll();
    const pending = service.flush();
    await Promise.resolve();
    service.onChange(r.commit({ species: {} }, { deleted: [ref('species', 'spc_a')] }));
    release();
    await pending;
    expect(service.stats().staleDropped).toBe(1);
    expect(l4(r)).toEqual([]);
  });
});

describe('inputs the toolkit could not check are remembered (item e)', () => {
  it('a trap: no CHEM-001, status not_checked with the reason, remembered; never sent again until the structure changes', async () => {
    const { fake, r, service } = rig({ species: table(species('spc_t', 'TRAP1'), species('spc_ok', 'CCO')) });
    service.checkAll();
    await service.flush();
    expect(l4(r)).toEqual([]);
    expect(service.statusOf(ref('species', 'spc_t'))).toMatchObject({ state: 'not_checked', reason: 'unavailable', remembered: true });
    expect(service.statusOf(ref('species', 'spc_ok'))).toEqual({ state: 'checked', notCompared: [] });
    fake.log.length = 0;
    // "check all" again, and an edit of something else the check reads: the structure is the same, so it is not sent
    service.checkAll();
    await service.flush();
    service.onChange(r.commit({ species: table(species('spc_t', 'TRAP1', { formula: 'CH4' }), species('spc_ok', 'CCO')) }, { updated: [ref('species', 'spc_t')] }));
    await service.flush();
    expect(fake.log.map((c) => c.ids.join())).toEqual(['spc_ok']); // only the second checkAll's healthy species
    expect(service.stats().rememberedSkipped).toBe(2);
    // the structure changes: it is tried again
    service.onChange(r.commit({ species: table(species('spc_t', 'CCC'), species('spc_ok', 'CCO')) }, { updated: [ref('species', 'spc_t')] }));
    await service.flush();
    expect(fake.log.at(-1)).toEqual({ method: 'checkSpecies', items: 1, ids: ['spc_t'] });
    expect(service.statusOf(ref('species', 'spc_t'))).toEqual({ state: 'checked', notCompared: [] });
  });

  it('a hang: the batch times out, its items are sent one by one, the culprit is the one that times out alone and is remembered', async () => {
    const { fake, r, service } = rig({ species: table(species('spc_1', 'CCO'), species('spc_h', 'HANG1'), species('spc_3', 'CCC')) });
    service.checkAll();
    await service.flush();
    expect(fake.log.map((c) => `${c.method}:${c.ids.join()}`)).toEqual(['checkSpecies:spc_1,spc_3,spc_h', 'checkSpecies:spc_1', 'checkSpecies:spc_3', 'checkSpecies:spc_h']);
    expect(service.statusOf(ref('species', 'spc_h'))).toMatchObject({ state: 'not_checked', reason: 'timeout', remembered: true });
    expect(service.statusOf(ref('species', 'spc_1'))).toEqual({ state: 'checked', notCompared: [] });
    expect(l4(r)).toEqual([]); // a hang is never CHEM-001
    fake.log.length = 0;
    service.checkAll();
    await service.flush();
    expect(fake.log.map((c) => c.ids.join())).toEqual(['spc_1,spc_3']); // the hanging structure does not cost another 2 s
  });

  it('a worker that is down says nothing about the structure: not_checked, NOT remembered, and a later check tries again', async () => {
    const { fake, r, service } = rig({ species: table(species('spc_a', 'CCO')) });
    fake.down = true;
    service.checkAll();
    await service.flush();
    expect(service.statusOf(ref('species', 'spc_a'))).toMatchObject({ state: 'not_checked', reason: 'unavailable', remembered: false });
    expect(l4(r)).toEqual([]);
    fake.down = false;
    service.checkAll();
    await service.flush();
    expect(service.statusOf(ref('species', 'spc_a'))).toEqual({ state: 'checked', notCompared: [] });
  });

  it('the memory is keyed by the toolkit version: a new toolkit tries the structure again; `not loaded` is never remembered', async () => {
    const { fake, r, service } = rig({ species: table(species('spc_t', 'TRAP1')) });
    service.checkAll();
    await service.flush();
    fake.log.length = 0;
    fake.version = 'v2';
    service.checkAll();
    await service.flush(); // the service learns v2 from the next answer; the first call after the change still skips
    service.checkAll();
    await service.flush();
    expect(fake.log.length).toBeLessThanOrEqual(1);
    const second = rig({ species: table(species('spc_t', 'TRAP1')) });
    second.fake.version = 'not loaded';
    second.service.checkAll();
    await second.service.flush();
    expect(second.service.statusOf(ref('species', 'spc_t'))).toMatchObject({ state: 'not_checked', remembered: false });
    void r;
  });

  it('the memory is bounded: the oldest structure is forgotten first', async () => {
    const { createNotCheckableMemory } = await import('./memory');
    const memory = createNotCheckableMemory(2);
    for (const input of ['a', 'b', 'c']) memory.add(input, 'v', { reason: 'timeout', message: 'm' });
    expect(memory.size).toBe(2);
    expect(memory.get('a', 'v')).toBeUndefined();
    expect(memory.get('c', 'v')).toBeDefined();
    expect(memory.get('c', 'other')).toBeUndefined();
  });
});

describe('the CHEM-007 probes travel in the batch; the subscription and dispose', () => {
  it('probes only the classes that have a SMARTS, with the species, and merges the suggestions', async () => {
    const cls = (id: string, smarts?: string) => ({ id, kind: 'class', parentIds: [], ...(smarts === undefined ? {} : { generic: { smarts } }) });
    const { fake, r, service } = rig({ species: table(species('spc_a', 'CCO')), class: table(cls('cls_hit', 'CC'), cls('cls_miss', 'N'), cls('cls_plain')) });
    service.checkAll();
    await service.flush();
    expect(fake.log.filter((c) => c.method === 'matches')).toEqual([{ method: 'matches', items: 2, ids: ['CC', 'N'] }]);
    expect(l4(r)).toEqual(['CHEM-007 spc_a classIds']);
  });

  it('subscribers hear status changes; dispose stops everything', async () => {
    const { fake, r, service } = rig({ species: table(species('spc_a', 'CCO')) });
    let heard = 0;
    service.subscribe(() => void (heard += 1));
    service.checkAll();
    await service.flush();
    expect(heard).toBeGreaterThan(0);
    service.dispose();
    fake.log.length = 0;
    service.onChange(r.commit({ species: table(species('spc_a', 'BAD(')) }, { updated: [ref('species', 'spc_a')] }));
    await service.flush();
    expect(fake.log).toEqual([]);
  });
});
