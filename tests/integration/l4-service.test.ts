/**
 * The L4 service over a REAL canonical store and REAL RDKit (step 4.3b, Phase 4 DoD): the demo's invalid species produces CHEM-001;
 * ADV-036 unit part (a structure RDKit cannot read is a WARNING and the record's commit is accepted); a species edit re-checks only
 * what the service says it does; findings never outlive their subject (Q10 b) and an L1-L3 commit never clears level-4 findings;
 * L4 never blocks and never changes data; CHEM-009 from the derived groups; CHEM-005 through the planner and the real balance.
 * One RDKit load for the file. The scripted-worker twin is src/workers/chem/l4/service.test.ts.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCanonicalStore, type StoreHandle } from '@/core/commands';
import type { CanonicalState, Reaction, RecordRef, Species } from '@/core/schema';
import { validator } from '@/core/validation';
import { realChemPort, realChecks } from '@/test-support/l4-real-kit';
import { demoRecords } from '@/test-support/legacy-classify-kit';
import { stateOfRecords } from '@/test-support/legacy-map-kit';
import { createL4Service, type L4Service } from '@/workers/chem';
import type { ChemChecks } from '@/chem';

const smiles = (value: string) => ({ format: 'smiles' as const, value });
const sp = (id: string): RecordRef => ({ kind: 'species', id });
const l4 = (store: StoreHandle) => store.findings.all({ level: 4 }).map((f) => `${f.ruleId} ${f.subject.id} ${f.path ?? ''}`);

let checks: ChemChecks;
const services: L4Service[] = [];
beforeAll(async () => {
  checks = await realChecks();
}, 60_000);
afterAll(() => services.forEach((service) => service.dispose()));

/** A real store over `state`, a service attached to it (the store's ChangeSets feed `onChange`), scheduling left to `flush`. */
function attach(state: CanonicalState) {
  const store = createCanonicalStore({ initial: state });
  const service = createL4Service({ state: () => store.getState(), findings: store.findings, chem: realChemPort(checks), schedule: () => undefined });
  services.push(service);
  store.subscribe((changes) => service.onChange(changes));
  return { store, service };
}

const demo = (): CanonicalState => stateOfRecords(demoRecords());
const speciesOf = (store: StoreHandle, id: string): Species => store.getState().records.species[id] as Species;

describe('the demo dataset (Phase 4 DoD)', () => {
  it('the demo\'s invalid species produces CHEM-001, as a WARNING of level 4; nothing else is an error or changed', async () => {
    const { store, service } = attach(demo());
    const before = store.getState();
    const errorsBefore = store.findings.all({ severity: 'error' }).length;
    service.checkAll();
    await service.flush();
    const found = store.findings.all({ level: 4 });
    const invalid = found.find((f) => f.ruleId === 'CHEM-001');
    expect(invalid).toMatchObject({ subject: sp('spc_invalid-smiles-demo'), severity: 'warning', level: 4, path: 'structure' });
    expect(store.getState()).toBe(before); // L4 never changes data
    expect(store.getRevision()).toBe(0);
    expect(store.findings.all({ severity: 'error' })).toHaveLength(errorsBefore);
    const perRule: Record<string, number> = {};
    for (const f of found) perRule[f.ruleId] = (perRule[f.ruleId] ?? 0) + 1;
    expect(perRule).toEqual({ 'CHEM-001': 1, 'CHEM-003': 1 });
    expect(found.find((f) => f.ruleId === 'CHEM-003')?.subject).toEqual(sp('spc_palmitic-acid'));
    // every species with a structure was checked, in batches of 32
    expect(service.stats().items.checkSpecies).toBe(65);
    expect(service.stats().calls.checkSpecies).toBe(3);
  });

  it('L1-L3 findings are exactly validateAll\'s, before and after the L4 pass (the two never mix)', async () => {
    const { store, service } = attach(demo());
    const strip = () => JSON.stringify(store.findings.all().filter((f) => f.level !== 4));
    const before = strip();
    service.checkAll();
    await service.flush();
    expect(strip()).toBe(before);
    expect(JSON.stringify([...validator.validateAll(store.getState(), store.getIndexes())].sort((a, b) => (a.id < b.id ? -1 : 1)))).toBe(
      JSON.stringify(store.findings.all().filter((f) => f.level !== 4).sort((a, b) => (a.id < b.id ? -1 : 1))),
    );
  });

  it('docs/reviews/demo-chem-findings.md lists exactly the findings the service gives for the demo (regenerate with node scripts/demo-chem-findings.mjs)', async () => {
    const { store, service } = attach(demo());
    service.checkAll();
    await service.flush();
    const doc = readFileSync('docs/reviews/demo-chem-findings.md', 'utf8');
    const listed = doc.split('\n').filter((line) => /^- CHEM-\d{3} \((warning|info|error)\) on /.test(line));
    const live = store.findings.all({ level: 4 });
    expect(listed).toHaveLength(live.length);
    for (const f of live) expect(doc).toContain(`- ${f.ruleId} (${f.severity}) on ${f.subject.kind} \`${f.subject.id}\``);
    expect(doc).toContain('REVIEW REQUIRED');
  });

  it('the statuses say what was not compared: every reaction of the demo, why; the mechanisms are compared', async () => {
    const { service } = attach(demo());
    service.checkAll();
    await service.flush();
    const status = service.statusOf({ kind: 'reaction', id: 'rxn_aniline-diazotisation' });
    expect(status).toMatchObject({ state: 'checked', notCompared: [{ ruleId: 'CHEM-005', reason: expect.stringContaining('has no coefficient') }] });
    expect(service.statusOf({ kind: 'mechanism', id: 'mec_aldol-ethanal' })).toEqual({ state: 'checked', notCompared: [] });
    expect(service.statusOf(sp('spc_invalid-smiles-demo'))).toEqual({ state: 'checked', notCompared: [] });
  });
});

describe('ADV-036, unit part: L4 never blocks a commit', () => {
  it('a species whose structure RDKit cannot read is committed (no ERROR), and shows up as a WARNING afterwards', async () => {
    const { store, service } = attach(demo());
    const template = speciesOf(store, 'spc_ethanol');
    const made = store.dispatch({ label: 'Add', commands: [{ type: 'record.create', record: { ...template, id: 'spc_adv036', names: { canonical: 'ADV-036 species', common: [], aliases: [] }, structure: smiles('C1CC('), formula: undefined } as unknown as Species }] });
    expect(made.ok).toBe(true);
    expect(store.getRevision()).toBe(1);
    await service.flush();
    const finding = store.findings.bySubject(sp('spc_adv036')).find((f) => f.ruleId === 'CHEM-001');
    expect(finding).toMatchObject({ severity: 'warning', level: 4 });
    expect(store.findings.bySubject(sp('spc_adv036')).filter((f) => f.severity === 'error')).toEqual([]);
    // and the commit that FIXES it is accepted too; the finding goes away
    const fixed = store.dispatch({ label: 'Fix', commands: [{ type: 'record.update', record: { ...speciesOf(store, 'spc_adv036'), structure: smiles('CCO') } as Species }] });
    expect(fixed.ok).toBe(true);
    await service.flush();
    expect(l4(store).filter((line) => line.includes('spc_adv036'))).toEqual([]);
  });
});

describe('what an edit re-checks, through the real store', () => {
  it('a structure edit re-checks that species only; an edit of a note re-checks nothing and keeps the level-4 finding (never cleared by L1-L3)', async () => {
    const { store, service } = attach(demo());
    service.checkAll();
    await service.flush();
    const base = service.stats();
    const invalid = speciesOf(store, 'spc_invalid-smiles-demo');
    mustOk(store.dispatch({ label: 'Note', commands: [{ type: 'record.update', record: { ...invalid, notes: 'a note' } as Species }] }));
    await service.flush();
    expect(service.stats().calls).toEqual(base.calls);
    expect(l4(store)).toContain('CHEM-001 spc_invalid-smiles-demo structure');
    mustOk(store.dispatch({ label: 'Structure', commands: [{ type: 'record.update', record: { ...speciesOf(store, 'spc_invalid-smiles-demo'), structure: smiles('CCO') } as Species }] }));
    await service.flush();
    expect(service.stats().items.checkSpecies).toBe(base.items.checkSpecies + 1);
    expect(l4(store).some((line) => line.startsWith('CHEM-001'))).toBe(false);
    // the ethanol of the demo now has the same canonical structure: CHEM-009 on both, nothing else
    expect(l4(store).filter((line) => line.startsWith('CHEM-009')).map((line) => line.split(' ')[1]).sort()).toEqual(['spc_ethanol', 'spc_invalid-smiles-demo']);
    mustOk(store.undo() ?? { ok: false });
    await service.flush();
    expect(l4(store).some((line) => line.startsWith('CHEM-009'))).toBe(false);
    expect(l4(store).filter((line) => line.startsWith('CHEM-001'))).toEqual(['CHEM-001 spc_invalid-smiles-demo structure']);
  });

  it('deleting a species clears its level-4 findings in the same commit, and the service forgets it (Q10 b)', async () => {
    const { store, service } = attach(demo());
    mustOk(store.dispatch({ label: 'Add', commands: [{ type: 'record.create', record: { ...speciesOf(store, 'spc_ethanol'), id: 'spc_gone', names: { canonical: 'Gone', common: [], aliases: [] }, structure: smiles('C(C)(C)(C)(C)C'), formula: undefined } as unknown as Species }] }));
    await service.flush();
    expect(l4(store)).toContain('CHEM-002 spc_gone structure');
    mustOk(store.dispatch({ label: 'Delete', commands: [{ type: 'record.delete', ref: sp('spc_gone'), mode: 'restrict' }] }));
    expect(l4(store).some((line) => line.includes('spc_gone'))).toBe(false); // before the service did anything
    expect(service.statusOf(sp('spc_gone'))).toEqual({ state: 'none' });
  });

  it('replaceState: findings of species that are gone are cleared by the store, the service re-checks what changed', async () => {
    const { store, service } = attach(demo());
    service.checkAll();
    await service.flush();
    const records = { ...store.getState().records.species };
    delete (records as Record<string, unknown>)['spc_invalid-smiles-demo'];
    const next = { ...store.getState(), records: { ...store.getState().records, species: records } } as CanonicalState;
    const result = store.replaceState(next, 'restore');
    if (!result.ok) throw new Error(result.error.message);
    expect(l4(store).some((line) => line.includes('invalid-smiles'))).toBe(false);
    expect(l4(store)).toContain('CHEM-003 spc_palmitic-acid formula'); // untouched subjects keep theirs
  });
});

describe('CHEM-009 and CHEM-005 through the real worker checks', () => {
  it('two species with the same canonical structure (CCO and OCC) are each other\'s CHEM-009, through the derived map', async () => {
    const { store, service } = attach(demo());
    service.checkAll(); // the derived groups are built from the species that were checked: the boot sweep comes first
    await service.flush();
    const template = speciesOf(store, 'spc_ethanol');
    const add = (id: string, structure: string) => store.dispatch({ label: id, commands: [{ type: 'record.create', record: { ...template, id, names: { canonical: id, common: [], aliases: [] }, structure: smiles(structure), formula: undefined } as unknown as Species }] });
    mustOk(add('spc_twin-a', 'OCC'));
    await service.flush();
    expect(l4(store).filter((line) => line.startsWith('CHEM-009')).map((line) => line.split(' ')[1]).sort()).toEqual(['spc_ethanol', 'spc_twin-a']);
    const finding = store.findings.bySubject(sp('spc_twin-a')).find((f) => f.ruleId === 'CHEM-009');
    expect(finding?.related).toEqual([sp('spc_ethanol')]);
  });

  it('a reaction whose outcome does not balance gets CHEM-005 (INFO) from the real balance; a balanced one none', async () => {
    const species = (id: string, value: string) => ({ id, kind: 'species', structure: smiles(value), classIds: [] }) as unknown as Species;
    const reaction = (waterCoefficient: number): Reaction =>
      ({
        id: 'rxn_t',
        kind: 'reaction',
        participants: [
          { id: 'prt_a', ref: { kind: 'species', id: 'spc_a' }, role: 'reactant', coefficient: 2 },
          { id: 'prt_b', ref: { kind: 'species', id: 'spc_b' }, role: 'reactant', coefficient: 1 },
        ],
        conditionVariants: [],
        outcomes: [{ id: 'out_1', conditionVariantIds: [], products: [{ id: 'prd_1', ref: { kind: 'species', id: 'spc_c' }, role: 'main', coefficient: 2 }, { id: 'prd_2', ref: { kind: 'species', id: 'spc_d' }, role: 'byproduct', coefficient: waterCoefficient }] }],
      }) as unknown as Reaction;
    const stateWith = (r: Reaction): CanonicalState => stateOfRecords([species('spc_a', 'CCO'), species('spc_b', 'O=O'), species('spc_c', 'CC=O'), species('spc_d', 'O'), r]);
    const findings = (await import('@/core/validation/store')).createFindingStore();
    const state = { current: stateWith(reaction(1)) };
    const service = createL4Service({ state: () => state.current, findings, chem: realChemPort(checks), schedule: () => undefined });
    services.push(service);
    service.checkAll();
    await service.flush();
    expect(findings.all({ level: 4 }).map((f) => [f.ruleId, f.severity, f.subject.id, f.path, (f.data as { differences: object }).differences])).toEqual([['CHEM-005', 'info', 'rxn_t', 'outcomes[0]', { H: 2, O: 1 }]]);
    state.current = stateWith(reaction(2));
    service.onChange({ revision: 1, label: 't', cause: 'command', created: [], updated: [{ kind: 'reaction', id: 'rxn_t' }], deleted: [], patches: [], inversePatches: [] });
    await service.flush();
    expect(findings.all({ level: 4 })).toEqual([]);
    expect(service.statusOf({ kind: 'reaction', id: 'rxn_t' })).toEqual({ state: 'checked', notCompared: [] });
  });
});

function mustOk(result: { readonly ok: boolean } & { readonly error?: { readonly message: string } }): void {
  if (!result.ok) throw new Error(result.error?.message ?? 'command failed');
}
