/**
 * The authoring comparator (step 6.9, Part 2): an authored reaction equals the demo reaction when everything but ids, nested ids, provenance,
 * review and the fields no editor can set is the same; every difference is said as "<field path in words>: demo <value>, authored <value>".
 * A reference to a record is compared by that record's NAME (the authored copy of a species made "from scratch" has another id).
 */
import { describe, expect, it } from 'vitest';
import { compareReaction, EXCLUDED_FIELDS, type NameOf } from './reaction-compare';

const names: Record<string, string> = { spc_a: 'Ethanol', spc_b: 'Ethanol', rgt_a: 'PCC', rgt_b: 'PCC', spc_x: 'Ethanal', spc_y: 'Methanal' };
const nameOf: NameOf = (id) => names[id];

const reaction = (over: Record<string, unknown> = {}, ids = { p: 'prt_1', s: 'stg_1', o: 'out_1', d: 'pdt_1', spc: 'spc_a', rgt: 'rgt_a', prod: 'spc_x' }) => ({
  id: 'rxn_one',
  kind: 'reaction',
  name: 'One',
  scope: 'specific',
  participants: [
    { id: ids.p, ref: { kind: 'species', id: ids.spc }, role: 'reactant' },
    { id: `${ids.p}b`, ref: { kind: 'reagent', id: ids.rgt }, role: 'reagent' },
  ],
  stages: [{ id: ids.s, kind: 'reaction', participantIds: [ids.p, `${ids.p}b`], parameters: { solventCharacter: [], activation: [], other: [], parsedFields: [] } }],
  outcomes: [{ id: ids.o, selectivity: 'major', conditionVariantIds: [], products: [{ id: ids.d, ref: { kind: 'species', id: ids.prod }, role: 'main' }], conceptIds: [] }],
  provenance: { origin: 'seed', updatedAt: 'a' },
  review: { lifecycle: 'published', status: 'unreviewed', reasons: [] },
  ...over,
});

describe('compareReaction', () => {
  it('equal when only ids, nested ids, provenance and review differ; references compare by name', () => {
    const authored = reaction(
      { id: 'rxn_new', provenance: { origin: 'user', updatedAt: 'b' }, review: { lifecycle: 'draft', status: 'review_required', reasons: ['x'] } },
      { p: 'prt_zz', s: 'stg_zz', o: 'out_zz', d: 'pdt_zz', spc: 'spc_b', rgt: 'rgt_b', prod: 'spc_x' },
    );
    expect(compareReaction(reaction(), authored, nameOf, nameOf)).toEqual([]);
  });
  it('says each difference as "<path in words>: demo <value>, authored <value>"', () => {
    const authored = reaction({ scope: 'generic' });
    const [first] = authored.outcomes;
    if (first !== undefined) first.selectivity = 'minor';
    expect(compareReaction(reaction(), authored, nameOf, nameOf)).toEqual([
      { path: 'outcome 1 selectivity', demo: 'major', authored: 'minor', text: 'outcome 1 selectivity: demo major, authored minor' },
      { path: 'scope', demo: 'specific', authored: 'generic', text: 'scope: demo specific, authored generic' },
    ]);
  });
  it('a different substance is a difference by its name, and a missing field says "(nothing)"', () => {
    const authored = reaction({}, { p: 'prt_1', s: 'stg_1', o: 'out_1', d: 'pdt_1', spc: 'spc_a', rgt: 'rgt_a', prod: 'spc_y' });
    (authored.participants[0] as Record<string, unknown>).coefficient = 2;
    const texts = compareReaction(reaction(), authored, nameOf, nameOf).map((one) => one.text);
    expect(texts).toContain('outcome 1 product 1 ref: demo species Ethanal, authored species Methanal');
    expect(texts).toContain('participant 1 coefficient: demo (nothing), authored 2');
  });
  it('an empty value (missing, "", [] or {}) is the same as nothing; array order matters', () => {
    const authored = reaction({ aliases: [], notes: '', selectivityNotes: {} });
    expect(compareReaction(reaction(), authored, nameOf, nameOf)).toEqual([]);
    const swapped = reaction();
    swapped.participants.reverse();
    expect(compareReaction(reaction(), swapped, nameOf, nameOf).map((one) => one.path)).toContain('participant 1 role');
  });
  it('the fields no editor can set are left out, and the list says them', () => {
    expect(EXCLUDED_FIELDS).toEqual(expect.arrayContaining(['mappedReaction', 'intermediates']));
    const demo = reaction({ mappedReaction: { format: 'reaction_smiles', value: 'C>>C' }, intermediates: [{ id: 'int_1', intermediateKind: 'other', label: 'x' }] });
    expect(compareReaction(demo, reaction(), nameOf, nameOf)).toEqual([]);
  });
  it('ids that appear inside text are left alone; ids of the other world are looked up in their own world', () => {
    const demoOf: NameOf = (id) => (id === 'spc_a' ? 'Ethanol' : undefined);
    const authoredOf: NameOf = (id) => (id === 'spc_b' ? 'Ethanol' : undefined);
    const authored = reaction({}, { p: 'prt_1', s: 'stg_1', o: 'out_1', d: 'pdt_1', spc: 'spc_b', rgt: 'rgt_a', prod: 'spc_x' });
    const texts = compareReaction(reaction(), authored, demoOf, authoredOf).map((one) => one.text);
    expect(texts.some((text) => text.startsWith('participant 1 ref'))).toBe(false);
  });
});

describe('a variant that names no stage', () => {
  const params = { solventCharacter: [], activation: [], other: [], parsedFields: [] };
  const withVariant = (stageId: string | undefined) => reaction({ conditionVariants: [{ id: 'cvr_1', label: 'hot', ...(stageId === undefined ? {} : { stageId }), parameters: params, participantIds: [] }] });
  it('equals one that names the first reaction stage, in both directions', () => {
    expect(compareReaction(withVariant(undefined), withVariant('stg_1'), nameOf, nameOf)).toEqual([]);
    expect(compareReaction(withVariant('stg_1'), withVariant(undefined), nameOf, nameOf)).toEqual([]);
  });
  it('differs from one that names another stage, and nothing is guessed when the reaction has no reaction stage', () => {
    const two = (id: string | undefined) => {
      const r = withVariant(id);
      return { ...r, stages: [...r.stages, { id: 'stg_2', kind: 'workup', participantIds: [], parameters: params }] };
    };
    expect(compareReaction(two(undefined), two('stg_2'), nameOf, nameOf).map((one) => one.path)).toEqual(['variant 1 stage id']);
    const bare = (id: string | undefined) => ({ ...withVariant(id), stages: [] });
    expect(compareReaction(bare(undefined), bare('stg_1'), nameOf, nameOf).map((one) => one.path)).toEqual(['variant 1 stage id']);
  });
});
