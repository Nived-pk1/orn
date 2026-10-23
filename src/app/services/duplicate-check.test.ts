/**
 * The duplicate check (step 6.2a part 5, over real RDKit and the real L4 service on the demo): by folded name (equal qualifiers), by
 * identical canonical structure, none, the record itself excluded, and a chem worker that cannot answer said in words.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { CanonicalState, ChemicalClass, Reagent, Species } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { indexEngine } from '@/core/indexes';
import { realChecks, realChemPort, realRig } from '@/test-support/l4-real-kit';
import type { ChemService } from '@/workers/chem';
import { createDuplicateCheck } from './duplicate-check';

const state: CanonicalState = demoState();
const indexes = indexEngine.build(state);
const ETHANOL = state.records.species['spc_ethanol' as never] as Species;

let check: ReturnType<typeof createDuplicateCheck>;
let chem: Pick<ChemService, 'checkSpecies'>;
beforeAll(async () => {
  const rig = await realRig(state);
  rig.service.checkAll();
  await rig.service.flush();
  chem = { checkSpecies: realChemPort(await realChecks()).checkSpecies } as never;
  check = createDuplicateCheck({ state: () => state, indexes: () => indexes, chem, l4: rig.service });
}, 120_000);

const draft = (over: Partial<Species> & { id?: string }): Species => ({ ...ETHANOL, id: 'spc_new-draft' as never, ...over }) as Species;
const names = (canonical: string, qualifier?: string) => ({ canonical, common: [], aliases: [], ...(qualifier === undefined ? {} : { qualifier }) });

describe('the duplicate check', () => {
  it('finds the existing species by NAME (folded: case and spacing) when the structure differs', async () => {
    const out = await check.check('species', draft({ names: names('  ETHANOL'.trim()), structure: { format: 'smiles', value: 'CCCO' } }));
    expect(out.matches).toMatchObject([{ ref: { id: 'spc_ethanol' }, name: 'Ethanol', reasons: ['name'] }]);
    expect(out.structureChecked).toBe(true);
  });

  it('finds it by identical canonical STRUCTURE when the name differs (OCC is CCO)', async () => {
    const out = await check.check('species', draft({ names: names('Ethyl alcohol, new'), structure: { format: 'smiles', value: 'OCC' } }));
    expect(out.matches).toMatchObject([{ ref: { id: 'spc_ethanol' }, reasons: ['structure'] }]);
  });

  it('by name AND structure: one match with both reasons, with its name, formula and structure for the dialog', async () => {
    const out = await check.check('species', draft({ names: names('Ethanol'), structure: { format: 'smiles', value: 'CCO' } }));
    expect(out.matches).toHaveLength(1);
    expect(out.matches[0]).toMatchObject({ name: 'Ethanol', formula: ETHANOL.formula, structure: ETHANOL.structure, reasons: ['name', 'structure'] });
  });

  it('a different qualifier tells two same-named species apart (the SPC-001 rule); no other match: no dialog', async () => {
    const out = await check.check('species', draft({ names: names('Ethanol', '(a new qualifier)'), structure: { format: 'smiles', value: 'CCCCCCCCCO' } }));
    expect(out.matches).toEqual([]);
    expect(out.more).toBe(0);
  });

  it('the record itself is never a match (editing ethanol, unchanged)', async () => {
    const out = await check.check('species', ETHANOL);
    expect(out.matches).toEqual([]);
  });

  it('a draft with no structure is checked by name only; an unreadable structure matches nothing by structure', async () => {
    const noStructure = { ...draft({ names: names('Ethanol') }) } as Record<string, unknown>;
    delete noStructure.structure;
    expect((await check.check('species', noStructure)).matches).toMatchObject([{ reasons: ['name'] }]);
    const broken = await check.check('species', draft({ names: names('Something else'), structure: { format: 'smiles', value: 'C1CC' } }));
    expect(broken).toMatchObject({ matches: [], structureChecked: true });
  });

  it('a chemistry worker that cannot answer is said in words (by name still works), never a clean answer', async () => {
    const dead = { checkSpecies: async () => ({ ok: false, reason: 'unavailable', error: 'the structure toolkit is not available' }) } as unknown as Pick<ChemService, 'checkSpecies'>;
    const rig = await realRig(state);
    const out = await createDuplicateCheck({ state: () => state, indexes: () => indexes, chem: dead, l4: rig.service }).check('species', draft({ names: names('Ethanol'), structure: { format: 'smiles', value: 'CCO' } }));
    expect(out.structureChecked).toBe(false);
    expect(out.message).toMatch(/^Structure duplicates could not be checked/);
    expect(out.matches).toMatchObject([{ reasons: ['name'] }]);
  });
});

/** Classes and reagents (step 6.2b part 4, decision D6): classes by folded name (equal qualifiers), reagents by folded name and by the same backing species. No chemistry. */
describe('the duplicate check for classes', () => {
  const ALCOHOLS = state.records.class['cls_alcohols' as never] as ChemicalClass;
  const cls = (over: Partial<ChemicalClass>): ChemicalClass => ({ ...ALCOHOLS, id: 'cls_new-draft' as never, ...over }) as ChemicalClass;

  it('finds the existing class by NAME (folded: case and spacing), with its name and generic formula for the dialog', async () => {
    const out = await check.check('class', cls({ names: names('  ALCOHOLS'.trim()) }));
    expect(out.matches).toMatchObject([{ ref: { kind: 'class', id: 'cls_alcohols' }, name: 'Alcohols', formula: 'R–OH', reasons: ['name'] }]);
    expect(out.structureChecked).toBe(true);
    expect(out.more).toBe(0);
  });

  it('a different qualifier tells two same-named classes apart (the CLS-002 rule); a new name matches nothing', async () => {
    expect((await check.check('class', cls({ names: names('Alcohols', '(a new qualifier)') }))).matches).toEqual([]);
    expect((await check.check('class', cls({ names: names('Diols') }))).matches).toEqual([]);
  });

  it('the class itself is never a match (editing Alcohols, unchanged)', async () => {
    expect((await check.check('class', ALCOHOLS)).matches).toEqual([]);
  });

  it('a draft that fails the schema is not checked (L1 first)', async () => {
    expect((await check.check('class', { ...cls({}), names: undefined })).matches).toEqual([]);
  });
});

describe('the duplicate check for reagents', () => {
  const KMNO4 = state.records.reagent['rgt_potassium-permanganate' as never] as Reagent;
  const rgt = (over: Partial<Reagent>): Reagent => ({ ...KMNO4, id: 'rgt_new-draft' as never, ...over }) as Reagent;

  it('finds the existing reagent by NAME (folded), with its display formula', async () => {
    const out = await check.check('reagent', rgt({ names: names('POTASSIUM  PERMANGANATE'.replace('  ', ' ')), speciesId: undefined } as never));
    expect(out.matches).toMatchObject([{ ref: { kind: 'reagent', id: 'rgt_potassium-permanganate' }, name: 'Potassium permanganate', formula: 'KMnO₄', reasons: ['name'] }]);
  });

  it('finds reagents by the SAME BACKING SPECIES when the names differ', async () => {
    const out = await check.check('reagent', rgt({ names: names('Purple stuff') }));
    expect(out.matches).toMatchObject([{ ref: { id: 'rgt_potassium-permanganate' }, reasons: ['species'] }]);
  });

  it('by name AND backing species: one match with both reasons', async () => {
    const out = await check.check('reagent', rgt({ names: names('Potassium permanganate') }));
    expect(out.matches).toHaveLength(1);
    expect(out.matches[0]?.reasons).toEqual(['name', 'species']);
  });

  it('ALIASES join the check (6.2 open item): a new reagent whose alias is the name of an existing one matches it, and so does a name that is an alias of another', async () => {
    const aliased = await check.check('reagent', rgt({ names: { canonical: 'Permanganate (new)', common: [], aliases: ['potassium PERMANGANATE'] }, speciesId: undefined } as never));
    expect(aliased.matches).toMatchObject([{ ref: { id: 'rgt_potassium-permanganate' }, reasons: ['name'] }]);
    const other = Object.values(state.records.reagent).find((one) => one.id !== KMNO4.id && one.names.aliases.length + one.names.common.length > 0);
    if (other === undefined) return;
    const spelling = [...other.names.common, ...other.names.aliases][0] as string;
    const byAlias = await check.check('reagent', rgt({ names: names(spelling), speciesId: undefined } as never));
    expect(byAlias.matches.map((one) => one.ref.id)).toContain(other.id);
  });
  it('a reagent without a backing species is checked by name only; the reagent itself is never a match', async () => {
    const out = await check.check('reagent', rgt({ names: names('Brand new mixture'), speciesId: undefined } as never));
    expect(out.matches).toEqual([]);
    expect((await check.check('reagent', KMNO4)).matches).toEqual([]);
  });

  it('other kinds are not checked', async () => {
    expect((await check.check('concept', { id: 'cpt_x' })).matches).toEqual([]);
  });
});
