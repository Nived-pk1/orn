/**
 * RXN-013…RXN-024 (ADV-005 for RXN-017, ADV-037 for RXN-014). Silent on the maximal fixture except
 * where the fixture itself is incomplete on purpose (RXN-015, RXN-016 are checked explicitly).
 */
import { describe, expect, it } from 'vitest';
import type { CanonicalState } from '@/core/schema';
import { add, clone, cloneAs, drop, edit, recordOf, ruleFindings, type Mutable } from '@/test-support/rule-harness';
import { loadFixtureState, must } from '@/test-support/state-fixture';

const base = loadFixtureState('maximal-valid');
const ID = 'rxn_max-grignard-propanone';
const GENERIC = 'rxn_max-grignard-ketone-generic';
const subject = { kind: 'reaction', id: ID } as const;
type R = Mutable<(typeof base.records.reaction)[string]>;

const fire = (rule: string, state: CanonicalState = base, id = ID) => ruleFindings(rule, state, { kind: 'reaction', id });
const change = (mutate: (r: R) => void, state: CanonicalState = base) => edit(state, 'reaction', ID, mutate);

describe('baseline', () => {
  it('RXN-013, 014, 017…024 are silent on every reaction of the maximal fixture', () => {
    for (const n of [13, 14, 17, 18, 19, 20, 21, 22, 23, 24]) expect(ruleFindings(`RXN-0${n}`, base), `RXN-${n}`).toEqual([]);
  });
});

describe('RXN-013 instanceOfId', () => {
  it('is silent for a specific reaction pointing at a generic one', () => {
    expect(recordOf(base, 'reaction', ID).instanceOfId).toBe(GENERIC);
    expect(fire('RXN-013')).toEqual([]);
  });

  it('is an ERROR when this reaction is generic, the target is specific, or the target is itself an instance', () => {
    expect(fire('RXN-013', change((r) => { r.scope = 'generic'; }))).toMatchObject([{ path: 'instanceOfId', severity: 'error', related: [{ id: GENERIC }] }]);
    const specificTarget = edit(base, 'reaction', GENERIC, (r) => { r.scope = 'specific'; });
    expect(fire('RXN-013', specificTarget)).toHaveLength(1);
    const chained = edit(base, 'reaction', GENERIC, (r) => { r.instanceOfId = 'rxn_max-tbuoh-dehydration' as never; });
    expect(fire('RXN-013', chained)).toHaveLength(1);
  });

  it('joins several problems into one finding at the field', () => {
    const both = edit(change((r) => { r.scope = 'generic'; }), 'reaction', GENERIC, (r) => { r.scope = 'specific'; });
    const found = fire('RXN-013', both);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain(';');
  });
});

describe('RXN-014 impossible conditions (ADV-037)', () => {
  const withTemperature = (temperature: unknown) => change((r) => { must(r.stages[0]).parameters.temperature = temperature as never; });

  it('flags a temperature below absolute zero in either unit, and a range with min above max', () => {
    expect(fire('RXN-014', withTemperature({ kind: 'value', value: -300, unit: 'C' }))).toMatchObject([{ path: 'stages[0].parameters.temperature', severity: 'error' }]);
    expect(fire('RXN-014', withTemperature({ kind: 'value', value: -1, unit: 'K' }))).toHaveLength(1);
    expect(fire('RXN-014', withTemperature({ kind: 'range', min: 10, max: 5, unit: 'C' }))).toHaveLength(1);
    expect(fire('RXN-014', withTemperature({ kind: 'range', min: -300, max: 5, unit: 'C' }))[0]?.message).toContain('absolute zero');
  });

  it('accepts absolute zero itself, ordinary ranges and qualitative values', () => {
    for (const t of [{ kind: 'value', value: 0, unit: 'K' }, { kind: 'value', value: -273.15, unit: 'C' }, { kind: 'range', min: 0, max: 5, unit: 'C' }, { kind: 'qualitative', value: 'cold' }]) {
      expect(fire('RXN-014', withTemperature(t)), JSON.stringify(t)).toEqual([]);
    }
  });

  it('checks pressure ranges, condition variants, reagent profiles and caveat triggers too', () => {
    const range = { kind: 'range', min: 5, max: 1, unit: 'atm' } as never;
    expect(fire('RXN-014', change((r) => { must(r.conditionVariants[0]).parameters.pressure = range; }))[0]?.path).toBe('conditionVariants[0].parameters.pressure');
    const reagent = edit(base, 'reagent', 'rgt_max-methylmagnesium-bromide', (g) => { must(g.profiles[0]).parameters.temperature = { kind: 'value', value: -1, unit: 'K' } as never; });
    expect(ruleFindings('RXN-014', reagent)).toMatchObject([{ subject: { kind: 'reagent' }, path: 'profiles[0].parameters.temperature' }]);
    const caveat = edit(base, 'caveat', 'cav_max-grignard-protic', (c) => { c.triggerConditions = { ...clone(must(c.triggerConditions)), temperature: { kind: 'range', min: 9, max: 1, unit: 'K' } } as never; });
    expect(ruleFindings('RXN-014', caveat)).toMatchObject([{ subject: { kind: 'caveat' }, path: 'triggerConditions.temperature' }]);
  });
});

describe('RXN-015 parsed conditions need confirmation', () => {
  it('is REVIEW_REQUIRED for every parameter set with parsedFields, and lists the fields', () => {
    const found = ruleFindings('RXN-015', base);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((f) => f.severity === 'review_required' && f.path?.endsWith('.parsedFields'))).toBe(true);
    const cleared = change((r) => { for (const s of r.stages) s.parameters.parsedFields = []; });
    expect(fire('RXN-015', cleared)).toEqual([]);
    const set = change((r) => { must(r.stages[0]).parameters.parsedFields = ['temperature', 'time']; });
    expect(fire('RXN-015', set)[0]).toMatchObject({ path: 'stages[0].parameters.parsedFields', data: { fields: ['temperature', 'time'] } });
  });
});

describe('RXN-016 published reaction without classification', () => {
  it('is INFO for a published reaction missing types, and lists what is missing', () => {
    const found = ruleFindings('RXN-016', base);
    expect(found.length).toBeGreaterThan(0);
    const bare = change((r) => { r.review.lifecycle = 'published'; r.reactionTypes = []; r.transformationIds = []; r.mechanismClasses = []; });
    expect(fire('RXN-016', bare)[0]?.message).toContain('no reaction type, no transformation, no mechanism class');
    const draft = change((r) => { r.review.lifecycle = 'draft'; r.reactionTypes = []; });
    expect(fire('RXN-016', draft)).toEqual([]);
  });
});

describe('RXN-017 product equals reactant (ADV-005)', () => {
  it('warns at the product', () => {
    const reactant = must(recordOf(base, 'reaction', ID).participants.find((p) => p.role === 'reactant')).ref;
    const loop = change((r) => { must(must(r.outcomes[0]).products[0]).ref = clone(reactant) as never; });
    expect(fire('RXN-017', loop)).toMatchObject([{ path: 'outcomes[0].products[0].ref', severity: 'warning', related: [{ id: reactant.id }] }]);
  });
});

describe('RXN-018 equilibrium without reverse', () => {
  const EQ = 'rxn_max-tbuoh-dehydration';
  it('is INFO for an equilibrium with no reverse_of relationship and no note', () => {
    const noNote = edit(base, 'reaction', EQ, (r) => { r.reversibility = { kind: 'equilibrium' } as never; });
    expect(fire('RXN-018', noNote, EQ)).toEqual([]); // rel_max-dehydration-hydration links it
    const unlinked = drop(noNote, 'relationship', 'rel_max-dehydration-hydration');
    expect(fire('RXN-018', unlinked, EQ)).toMatchObject([{ path: 'reversibility.kind', severity: 'info' }]);
    const noted = edit(unlinked, 'reaction', EQ, (r) => { r.reversibility = { kind: 'equilibrium', note: 'Because.' } as never; });
    expect(fire('RXN-018', noted, EQ)).toEqual([]);
  });

  it('a relationship of another type does not count', () => {
    const state = edit(base, 'reaction', 'rxn_max-tbuoh-dehydration', (r) => { r.reversibility = { kind: 'equilibrium' } as never; });
    const other = edit(state, 'relationship', 'rel_max-dehydration-hydration', (r) => { r.type = 'related_to'; delete (r as { reverseKind?: string }).reverseKind; });
    expect(fire('RXN-018', other, 'rxn_max-tbuoh-dehydration')).toHaveLength(1);
  });
});

describe('RXN-019 intermediate identity', () => {
  it('is an ERROR for an intermediate with no ref, label or structure', () => {
    const bad = change((r) => { r.intermediates = [{ id: 'int_bare', intermediateKind: 'carbocation' } as never]; });
    expect(fire('RXN-019', bad)).toMatchObject([{ path: 'intermediates[0]', severity: 'error' }]);
    const labelled = change((r) => { r.intermediates = [{ id: 'int_bare', intermediateKind: 'carbocation', label: 'R⁺' } as never]; });
    expect(fire('RXN-019', labelled)).toEqual([]);
  });
});

describe('RXN-020 unused condition variant', () => {
  const three = change((r) => {
    r.conditionVariants.push({ ...clone(must(r.conditionVariants[0])), id: 'cvr_b' as never, label: 'B' });
    r.conditionVariants.push({ ...clone(must(r.conditionVariants[0])), id: 'cvr_c' as never, label: 'C' });
  });

  it('warns for a variant no outcome uses, when several exist and no outcome applies to all', () => {
    expect(fire('RXN-020', three)).toMatchObject([{ path: 'conditionVariants[1]' }, { path: 'conditionVariants[2]' }]);
    expect(fire('RXN-020', change((r) => { r.conditionVariants.push({ ...clone(must(r.conditionVariants[0])), id: 'cvr_b' as never }); }))).toHaveLength(1);
  });

  it('is silent with one variant, or when an outcome applies under all variants', () => {
    expect(fire('RXN-020')).toEqual([]);
    expect(fire('RXN-020', edit(three, 'reaction', ID, (r) => { must(r.outcomes[0]).conditionVariantIds = []; }))).toEqual([]);
  });
});

describe('RXN-021 same substance and role twice', () => {
  it('warns at the repeat, but not when the uses differ by stage or variant', () => {
    const twice = change((r) => {
      const first = must(r.participants[0]);
      r.participants.push({ ...clone(first), id: 'prt_again' as never });
      must(r.stages[0]).participantIds.push('prt_again' as never);
    });
    expect(fire('RXN-021', twice)).toMatchObject([{ path: 'participants[4].ref', severity: 'warning' }]);
    const otherStage = change((r) => {
      r.participants.push({ ...clone(must(r.participants[0])), id: 'prt_again' as never });
      must(r.stages[1]).participantIds.push('prt_again' as never);
    });
    expect(fire('RXN-021', otherStage)).toEqual([]);
  });
});

describe('RXN-022 scope and class references', () => {
  it('warns for a generic reaction without classes and a specific one with classes', () => {
    const generic = ruleFindings('RXN-022', base);
    expect(generic).toEqual([]);
    const noClasses = edit(base, 'reaction', GENERIC, (r) => {
      for (const p of r.participants) if (p.ref.kind === 'class') p.ref = { kind: 'species', id: 'spc_max-propanone' } as never;
      for (const o of r.outcomes) for (const p of o.products) if (p.ref.kind === 'class') p.ref = { kind: 'species', id: 'spc_max-propanone' } as never;
    });
    expect(fire('RXN-022', noClasses, GENERIC)).toMatchObject([{ path: 'scope' }]);
    const withClass = change((r) => { must(r.participants[0]).ref = { kind: 'class', id: 'cls_max-ketones' } as never; });
    expect(fire('RXN-022', withClass)).toMatchObject([{ path: 'scope' }]);
  });
});

describe('RXN-023 work-up reagent placement', () => {
  it('warns when a work-up reagent sits in a reaction stage, and not when it is in a work-up or quench stage', () => {
    const moved = change((r) => {
      must(r.stages[1]).participantIds = [];
      must(r.stages[0]).participantIds.push('prt_max-grignard-workup' as never);
    });
    expect(fire('RXN-023', moved)).toMatchObject([{ path: 'participants[3].role' }]);
    expect(fire('RXN-023', change((r) => { must(r.stages[1]).kind = 'quench'; }))).toEqual([]);
    expect(fire('RXN-023', change((r) => { r.stages = []; }))).toEqual([]);
  });
});

describe('RXN-024 coefficient on catalyst or solvent', () => {
  it('is INFO', () => {
    const bad = change((r) => { must(r.participants[2]).coefficient = 2; });
    expect(fire('RXN-024', bad)).toMatchObject([{ path: 'participants[2].coefficient', severity: 'info' }]);
    expect(fire('RXN-024', change((r) => { must(r.participants[0]).coefficient = 2; }))).toEqual([]);
  });
});

describe('unrelated helpers stay honest', () => {
  it('add() and cloneAs() produce a record the rules can run on', () => {
    const copy = cloneAs(recordOf(base, 'reaction', ID), 'rxn_copy');
    const state = add(base, 'reaction', copy);
    expect(subject.kind).toBe('reaction');
    expect(ruleFindings('RXN-001', state, { kind: 'reaction', id: 'rxn_copy' })).toEqual([]);
  });
});
