/**
 * SPC-, CLS-, RGT- and HIER- rules (ADV-016 class cycle, ADV-022 same-name species).
 */
import { describe, expect, it } from 'vitest';
import type { CanonicalState } from '@/core/schema';
import { add, cloneAs, edit, recordOf, ruleFindings } from '@/test-support/rule-harness';
import { loadFixtureState, must } from '@/test-support/state-fixture';

const base = loadFixtureState('maximal-valid');
const WATER = 'spc_max-water';
const ALC = 'cls_max-alcohols';
const TERT = 'cls_max-tertiary-alcohols';
const KET = 'cls_max-ketones';
const MG = 'rgt_max-methylmagnesium-bromide';
const ACID = 'rgt_max-dilute-acid';

const species = (rule: string, state: CanonicalState, id = WATER) => ruleFindings(rule, state, { kind: 'species', id });
const klass = (rule: string, state: CanonicalState, id: string) => ruleFindings(rule, state, { kind: 'class', id });

describe('baseline', () => {
  it('the fixture raises none of SPC-001…006, CLS-001/002, RGT-002, HIER-001…003', () => {
    for (const rule of ['SPC-001', 'SPC-002', 'SPC-003', 'SPC-004', 'SPC-005', 'SPC-006', 'SPC-007', 'CLS-001', 'CLS-002', 'RGT-002', 'HIER-001', 'HIER-002', 'HIER-003']) {
      expect(ruleFindings(rule, base), rule).toEqual([]);
    }
  });
});

describe('SPC-001 same canonical name (ADV-022)', () => {
  const twin = add(base, 'species', cloneAs(recordOf(base, 'species', WATER), 'spc_water-two'));

  it('warns on both species and keeps both records', () => {
    expect(species('SPC-001', twin)).toMatchObject([{ path: 'names.canonical', severity: 'warning', related: [{ id: 'spc_water-two' }] }]);
    expect(species('SPC-001', twin, 'spc_water-two')).toMatchObject([{ related: [{ id: WATER }] }]);
    expect(Object.keys(twin.records.species)).toContain(WATER);
  });

  it('folds before comparing (case, spacing) and is silenced by differing qualifiers', () => {
    const shouted = edit(twin, 'species', 'spc_water-two', (s) => { s.names.canonical = 'WATER'; });
    expect(species('SPC-001', shouted)).toHaveLength(1);
    const qualified = edit(twin, 'species', 'spc_water-two', (s) => { s.names.qualifier = '(heavy)'; });
    expect(species('SPC-001', qualified)).toEqual([]);
    const both = edit(qualified, 'species', WATER, (s) => { s.names.qualifier = '(heavy)'; });
    expect(species('SPC-001', both)).toHaveLength(1);
  });

  it('does not treat an alias that equals another canonical name as a duplicate', () => {
    const aliased = edit(twin, 'species', 'spc_water-two', (s) => { s.names.canonical = 'Dihydrogen oxide'; s.names.aliases = ['Water']; });
    expect(species('SPC-001', aliased)).toEqual([]);
  });
});

describe('SPC-002 / 003 / 004', () => {
  it('SPC-002: an ion needs a non-zero charge', () => {
    expect(species('SPC-002', edit(base, 'species', WATER, (s) => { s.speciesKind = 'ion'; }))).toMatchObject([{ path: 'charge', severity: 'warning' }]);
    expect(species('SPC-002', edit(base, 'species', WATER, (s) => { s.speciesKind = 'ion'; s.charge = 0; }))).toHaveLength(1);
    expect(species('SPC-002', edit(base, 'species', WATER, (s) => { s.speciesKind = 'ion'; s.charge = -1; }))).toEqual([]);
  });

  it('SPC-003: a single stereoisomer needs descriptors', () => {
    const bad = edit(base, 'species', WATER, (s) => { s.stereo = { kind: 'single_stereoisomer', descriptors: [] }; });
    expect(species('SPC-003', bad)).toMatchObject([{ path: 'stereo.descriptors' }]);
    expect(species('SPC-003', edit(bad, 'species', WATER, (s) => { must(s.stereo).descriptors = ['2R']; }))).toEqual([]);
  });

  it('SPC-004: INFO only when both structure and formula are missing', () => {
    const bare = edit(base, 'species', WATER, (s) => { delete (s as { structure?: unknown }).structure; delete (s as { formula?: unknown }).formula; });
    expect(species('SPC-004', bare)).toMatchObject([{ severity: 'info' }]);
    expect(species('SPC-004', edit(bare, 'species', WATER, (s) => { s.formula = 'H2O'; }))).toEqual([]);
  });
});

describe('SPC-007 property key other', () => {
  const withProperty = (property: object) => edit(base, 'species', WATER, (s) => { s.properties.push(property as never); });

  it('is an ERROR without a label, and fine with one or for any other key', () => {
    const bare = withProperty({ key: 'other', value: 'x', citations: [] });
    expect(species('SPC-007', bare)).toMatchObject([{ severity: 'error', path: expect.stringMatching(/^properties\[\d+\]\.label$/) as string }]);
    expect(species('SPC-007', withProperty({ key: 'other', label: 'Reactivity', value: 'x', citations: [] }))).toEqual([]);
    expect(species('SPC-007', withProperty({ key: 'colour', value: 'x', citations: [] }))).toEqual([]);
  });
});

describe('SPC-005 species named like a class', () => {
  it('is INFO, and follows a rename of either side', () => {
    const named = edit(base, 'species', WATER, (s) => { s.names.canonical = 'Ketones (fixture)'; });
    expect(species('SPC-005', named)).toMatchObject([{ severity: 'info', related: [{ kind: 'class', id: KET }] }]);
    expect(species('SPC-005', edit(base, 'class', KET, (c) => { c.names.canonical = 'Water'; }))).toHaveLength(1);
  });
});

describe('SPC-006 class and its ancestor both listed', () => {
  it('flags the entry for the more general class; a lone class or unrelated pair is fine', () => {
    const both = edit(base, 'species', 'spc_max-2-methylpropan-2-ol', (s) => { s.classIds = [TERT as never, ALC as never]; });
    expect(species('SPC-006', both, 'spc_max-2-methylpropan-2-ol')).toMatchObject([{ path: 'classIds[0]', severity: 'info', related: [{ id: ALC }] }]);
    expect(species('SPC-006', edit(base, 'species', WATER, (s) => { s.classIds = [KET as never, ALC as never]; }))).toEqual([]);
  });
});

describe('CLS-001 examples must list the class or a descendant', () => {
  it('accepts a species of a descendant class and flags one of an unrelated class', () => {
    expect(klass('CLS-001', edit(base, 'class', ALC, (c) => { c.exampleSpeciesIds = ['spc_max-2-methylpropan-2-ol' as never]; }), ALC)).toEqual([]);
    const bad = edit(base, 'class', KET, (c) => { c.exampleSpeciesIds = [WATER as never]; });
    expect(klass('CLS-001', bad, KET)).toMatchObject([{ path: 'exampleSpeciesIds[0]', severity: 'warning', related: [{ id: WATER }] }]);
  });
});

describe('CLS-002 same class name', () => {
  it('warns on both classes', () => {
    const twin = add(base, 'class', cloneAs(recordOf(base, 'class', KET), 'cls_ketones-two'));
    expect(klass('CLS-002', twin, KET)).toMatchObject([{ path: 'names.canonical', related: [{ id: 'cls_ketones-two' }] }]);
    expect(klass('CLS-002', twin, 'cls_ketones-two')).toHaveLength(1);
  });
});

describe('RGT-001 / RGT-002', () => {
  it('RGT-001 fires while a reagent has both speciesId and components, and not after one is removed', () => {
    expect(ruleFindings('RGT-001', base, { kind: 'reagent', id: MG })).toMatchObject([{ path: 'speciesId', severity: 'warning' }]);
    expect(ruleFindings('RGT-001', edit(base, 'reagent', MG, (r) => { r.components = []; }), { kind: 'reagent', id: MG })).toEqual([]);
  });

  it('RGT-002 flags a repeated profile label after folding', () => {
    const dup = edit(base, 'reagent', MG, (r) => { r.profiles.push({ ...must(r.profiles[0]), id: 'rpf_two' as never, label: 'DRY ETHER, INERT  atmosphere' }); });
    expect(ruleFindings('RGT-002', dup, { kind: 'reagent', id: MG })).toMatchObject([{ path: 'profiles[1].label' }]);
  });
});

describe('HIER-001 hierarchy cycles (ADV-016)', () => {
  const cycle = edit(base, 'class', ALC, (c) => { c.parentIds = [TERT as never]; });

  it('flags every member of a class cycle, at the parent link', () => {
    expect(klass('HIER-001', cycle, ALC)).toMatchObject([{ path: 'parentIds[0]', severity: 'error', related: [{ id: TERT }] }]);
    expect(klass('HIER-001', cycle, TERT)).toMatchObject([{ path: 'parentIds[0]', related: [{ id: ALC }] }]);
    expect(klass('HIER-001', cycle, KET)).toEqual([]);
  });

  it('flags a record that is its own parent, and a longer cycle through three classes', () => {
    expect(klass('HIER-001', edit(base, 'class', KET, (c) => { c.parentIds = [KET as never]; }), KET)).toHaveLength(1);
    const three = edit(edit(cycle, 'class', ALC, (c) => { c.parentIds = ['cls_max-alkenes' as never]; }), 'class', 'cls_max-alkenes', (c) => { c.parentIds = [TERT as never]; });
    expect(ruleFindings('HIER-001', three).map((f) => f.subject.id).sort()).toEqual([ALC, 'cls_max-alkenes', TERT].sort());
  });

  it('covers concept, named-reaction and topic hierarchies', () => {
    const concept = edit(base, 'concept', 'cpt_max-nucleophilic-addition', (c) => { c.parentIds = ['cpt_max-carbonyl-addition' as never]; });
    expect(ruleFindings('HIER-001', concept).map((f) => f.subject.kind)).toEqual(['concept', 'concept']);
    const named = edit(base, 'named_reaction', 'nrx_max-grignard-reactions', (n) => { n.parentIds = ['nrx_max-grignard-carbonyl-addition' as never]; });
    expect(ruleFindings('HIER-001', named)).toHaveLength(2);
    const topic = edit(base, 'topic', 'top_max-organic', (t) => { t.parentId = 'top_max-grignard' as never; });
    expect(ruleFindings('HIER-001', topic)).toMatchObject([{ path: 'parentId' }, { path: 'parentId' }, { path: 'parentId' }]);
  });

  it('terminates on a large cycle', () => {
    let state = base;
    const ids = Array.from({ length: 200 }, (_, i) => `cls_ring-${i}`);
    for (const id of ids) state = add(state, 'class', cloneAs(recordOf(base, 'class', KET), id));
    ids.forEach((id, i) => { state = edit(state, 'class', id, (c) => { c.names.canonical = id; c.parentIds = [ids[(i + 1) % ids.length] as never]; c.exampleSpeciesIds = []; }); });
    expect(ruleFindings('HIER-001', state)).toHaveLength(200);
  });
});

describe('HIER-002 topic level', () => {
  it('warns when a topic sits under a finer-grained one; equal or coarser parents are fine', () => {
    const inverted = edit(base, 'topic', 'top_max-alcohols', (t) => { t.topicKind = 'subtopic'; });
    expect(ruleFindings('HIER-002', inverted)).toMatchObject([{ subject: { id: 'top_max-grignard' }, path: 'parentId', severity: 'warning' }]);
    expect(ruleFindings('HIER-002', edit(base, 'topic', 'top_max-grignard', (t) => { t.topicKind = 'chapter'; }))).toEqual([]);
  });
});

describe('HIER-003 reagent composition cycles', () => {
  const component = (id: string) => ({ ref: { kind: 'reagent', id }, role: 'active' }) as never;

  it('flags a reagent built from itself and a two-reagent cycle, but not a plain nesting', () => {
    expect(ruleFindings('HIER-003', edit(base, 'reagent', ACID, (r) => { r.components = [component(ACID)]; }))).toMatchObject([{ path: 'components[0].ref', severity: 'error' }]);
    const nested = edit(base, 'reagent', ACID, (r) => { r.components = [component(MG)]; });
    expect(ruleFindings('HIER-003', nested)).toEqual([]);
    const cyclic = edit(nested, 'reagent', MG, (r) => { r.components.push(component(ACID)); });
    expect(ruleFindings('HIER-003', cyclic).map((f) => f.subject.id).sort()).toEqual([ACID, MG].sort());
  });
});
