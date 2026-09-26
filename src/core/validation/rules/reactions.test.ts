/**
 * RXN-001…RXN-012 (ADV-008, ADV-009, ADV-010, ADV-023, ADV-025, ADV-026). Each rule: silent on the
 * maximal fixture's reactions, fires on a minimal edit at the documented path and severity.
 */
import { describe, expect, it } from 'vitest';
import type { CanonicalState } from '@/core/schema';
import { clone, edit, ruleFindings, type Mutable } from '@/test-support/rule-harness';
import { loadFixtureState, must } from '@/test-support/state-fixture';

const base = loadFixtureState('maximal-valid');
const ID = 'rxn_max-grignard-propanone';
const subject = { kind: 'reaction', id: ID } as const;
type R = Mutable<(typeof base.records.reaction)[string]>;

const fire = (rule: string, state: CanonicalState = base) => ruleFindings(rule, state, subject);
const change = (mutate: (r: R) => void, state: CanonicalState = base) => edit(state, 'reaction', ID, mutate);
const lifecycle = (state: CanonicalState, value: 'draft' | 'published') => change((r) => { r.review.lifecycle = value; }, state);
const outcome = (r: R, i = 0) => must(r.outcomes[i]);
const variantIds = (r: R): string[] => r.conditionVariants.map((v) => v.id);

/** A reaction with two outcomes over two variants, for the selectivity rules. */
function twoOutcomes(first: string, second: string, sameVariants = false): CanonicalState {
  return change((r) => {
    const v0 = must(r.conditionVariants[0]);
    const v1 = { ...clone(v0), id: 'cvr_second' as never };
    r.conditionVariants.push(v1);
    const one = outcome(r);
    const two = { ...clone(one), id: 'out_second' as never, products: one.products.map((p, i) => ({ ...clone(p), id: `pdt_second-${i}` as never })) };
    one.selectivity = first as never;
    two.selectivity = second as never;
    one.conditionVariantIds = [v0.id];
    two.conditionVariantIds = sameVariants ? [v0.id] : [v1.id];
    r.outcomes.push(two);
  });
}

describe('baseline', () => {
  it('no RXN-001…012 finding on any reaction of the maximal fixture', () => {
    for (let n = 1; n <= 12; n += 1) expect(ruleFindings(`RXN-${String(n).padStart(3, '0')}`, base), `RXN-${n}`).toEqual([]);
  });
});

describe('RXN-001 no reactant', () => {
  const noReactant = (state: CanonicalState) => change((r) => { for (const p of r.participants) if (p.role === 'reactant') p.role = 'reagent'; }, state);
  it('is a WARNING on a draft and an ERROR once published', () => {
    expect(fire('RXN-001', lifecycle(noReactant(base), 'draft'))).toMatchObject([{ path: 'participants', severity: 'warning' }]);
    expect(fire('RXN-001', lifecycle(noReactant(base), 'published'))).toMatchObject([{ severity: 'error' }]);
  });
});

describe('RXN-002 / RXN-003 outcomes without products (draft reaction with no product: warning)', () => {
  it('RXN-002 fires when no outcome has a product; lifecycle decides the severity', () => {
    const empty = change((r) => { for (const o of r.outcomes) o.products = []; });
    expect(fire('RXN-002', lifecycle(empty, 'draft'))).toMatchObject([{ path: 'outcomes', severity: 'warning' }]);
    expect(fire('RXN-002', lifecycle(empty, 'published'))[0]?.severity).toBe('error');
    expect(fire('RXN-002', lifecycle(change((r) => { r.outcomes = []; }), 'draft'))).toHaveLength(1);
  });

  it('RXN-003 names the outcome whose product list is empty, not the others', () => {
    const state = twoOutcomes('major', 'minor');
    const edited = edit(state, 'reaction', ID, (r) => { outcome(r, 1).products = []; });
    expect(fire('RXN-003', lifecycle(edited, 'published'))).toMatchObject([{ path: 'outcomes[1].products', severity: 'error' }]);
    expect(fire('RXN-002', edited)).toEqual([]);
  });
});

describe('RXN-004 spectator contributing atoms (ADV-026)', () => {
  it('is an ERROR at the flag; a spectator without the flag, or a reagent with it, is fine', () => {
    const bad = change((r) => { const p = must(r.participants[2]); p.role = 'spectator'; p.flags = { contributesAtoms: true }; });
    expect(fire('RXN-004', bad)).toMatchObject([{ path: 'participants[2].flags.contributesAtoms', severity: 'error' }]);
    expect(fire('RXN-004', change((r) => { must(r.participants[2]).role = 'spectator'; }))).toEqual([]);
    expect(fire('RXN-004', change((r) => { must(r.participants[1]).flags = { contributesAtoms: true }; }))).toEqual([]);
  });
});

describe('RXN-005 catalyst consumed (ADV-025)', () => {
  it('warns on a catalyst marked consumed only', () => {
    const bad = change((r) => { const p = must(r.participants[1]); p.role = 'catalyst'; p.flags = { consumed: true }; });
    expect(fire('RXN-005', bad)).toMatchObject([{ path: 'participants[1].flags.consumed', severity: 'warning' }]);
    expect(fire('RXN-005', change((r) => { const p = must(r.participants[1]); p.role = 'catalyst'; p.flags = { catalytic: true }; }))).toEqual([]);
  });
});

describe('RXN-006 several primary substrates', () => {
  it('warns once, on the participant list, when two are marked', () => {
    const two = change((r) => { must(r.participants[0]).isPrimarySubstrate = true; must(r.participants[1]).isPrimarySubstrate = true; });
    expect(fire('RXN-006', two)).toMatchObject([{ path: 'participants', severity: 'warning', data: { count: 2 } }]);
    expect(fire('RXN-006', change((r) => { must(r.participants[0]).isPrimarySubstrate = true; }))).toEqual([]);
  });
});

describe('RXN-007 stages and participants', () => {
  it('flags a participant in no stage and one in two stages, as ERRORs; ignores reactions without stages', () => {
    const none = change((r) => { must(r.stages[0]).participantIds = must(r.stages[0]).participantIds.filter((id) => id !== 'prt_max-grignard-ether'); });
    expect(fire('RXN-007', none)).toMatchObject([{ path: 'participants[2]', severity: 'error', data: { stages: 0 } }]);
    const two = change((r) => { must(r.stages[1]).participantIds.push('prt_max-grignard-ether' as never); });
    expect(fire('RXN-007', two)).toMatchObject([{ path: 'participants[2]', data: { stages: 2 } }]);
    expect(fire('RXN-007', change((r) => { r.stages = []; }))).toEqual([]);
  });
});

describe('RXN-008 exclusive outcome overlap (ADV-009)', () => {
  it('is an ERROR when an exclusive outcome shares a variant with another; disjoint variants are fine (ADV-008)', () => {
    expect(fire('RXN-008', twoOutcomes('exclusive', 'minor', true))).toMatchObject([{ path: 'outcomes[0].selectivity', severity: 'error' }]);
    expect(fire('RXN-008', twoOutcomes('exclusive', 'minor', false))).toEqual([]);
  });

  it('treats an outcome with no variant list as overlapping every variant', () => {
    const state = twoOutcomes('exclusive', 'major', false);
    const open = edit(state, 'reaction', ID, (r) => { outcome(r, 1).conditionVariantIds = []; });
    expect(fire('RXN-008', open)).toHaveLength(1);
  });
});

describe('RXN-009 minor without major (ADV-010)', () => {
  it('warns when no major overlaps, and is silent when one does', () => {
    expect(fire('RXN-009', twoOutcomes('minor', 'trace', true))).toMatchObject([{ path: 'outcomes[0].selectivity', severity: 'warning' }]);
    expect(fire('RXN-009', twoOutcomes('major', 'minor', true))).toEqual([]);
    expect(fire('RXN-009', twoOutcomes('major', 'minor', false))).toHaveLength(1);
  });
});

describe('RXN-010 several majors', () => {
  it('warns on the later major of the same variants and isomer group only', () => {
    expect(fire('RXN-010', twoOutcomes('major', 'major', true))).toMatchObject([{ path: 'outcomes[1].selectivity' }]);
    expect(fire('RXN-010', twoOutcomes('major', 'major', false))).toEqual([]);
    const grouped = edit(twoOutcomes('major', 'major', true), 'reaction', ID, (r) => { outcome(r, 0).isomerGroup = 'A'; outcome(r, 1).isomerGroup = 'B'; });
    expect(fire('RXN-010', grouped)).toEqual([]);
  });
});

describe('RXN-011 profile on a non-reagent (ADV-023: role and ref are per participation)', () => {
  it('is an ERROR when the participant is a species; a reagent participant may name a profile', () => {
    const bad = change((r) => { must(r.participants[0]).profileId = 'rpf_xx' as never; });
    expect(fire('RXN-011', bad)).toMatchObject([{ path: 'participants[0].profileId', severity: 'error' }]);
    expect(fire('RXN-011', change((r) => { must(r.participants[1]).profileId = 'rpf_xx' as never; }))).toEqual([]);
  });
});

describe('RXN-012 mixed variant scoping', () => {
  it('is INFO when some outcomes are variant-specific and others are not', () => {
    const state = twoOutcomes('major', 'minor', false);
    const mixed = edit(state, 'reaction', ID, (r) => { outcome(r, 1).conditionVariantIds = []; });
    expect(fire('RXN-012', mixed)).toMatchObject([{ path: 'outcomes', severity: 'info' }]);
    expect(fire('RXN-012', state)).toEqual([]);
    expect(fire('RXN-012', edit(state, 'reaction', ID, (r) => { for (const o of r.outcomes) o.conditionVariantIds = []; }))).toEqual([]);
    expect(variantIds(must(edit(state, 'reaction', ID, () => undefined).records.reaction[ID]) as R)).toHaveLength(2);
  });
});
