/**
 * MEC-, CAV-, REL- and RTE- rules (INV-09 for prerequisite_of and route cycles, INV-15 relationships).
 */
import { describe, expect, it } from 'vitest';
import type { CanonicalState } from '@/core/schema';
import { add, cloneAs, edit, recordOf, ruleFindings } from '@/test-support/rule-harness';
import { loadFixtureState, must } from '@/test-support/state-fixture';

const base = loadFixtureState('maximal-valid');
const MEC = 'mec_max-grignard-addition';
const CAV = 'cav_max-grignard-protic';
const REL = 'rel_max-dehydration-hydration';
const ROUTE = 'rte_max-propanone-to-isobutene';
const DEHYD = 'rxn_max-tbuoh-dehydration';
const HYDR = 'rxn_max-isobutene-hydration';
const S1 = 'rst_max-route-grignard';
const S2 = 'rst_max-route-dehydration';
const ends = { kind: 'reaction' } as const;

const on = (rule: string, state: CanonicalState, kind: 'mechanism' | 'caveat' | 'relationship' | 'route', id: string) =>
  ruleFindings(rule, state, { kind, id });

describe('baseline', () => {
  it('MEC-001/002/004, CAV-*, REL-*, RTE-* are silent on the maximal fixture', () => {
    for (const rule of ['MEC-001', 'MEC-002', 'MEC-004', 'CAV-001', 'CAV-002', 'REL-001', 'REL-002', 'REL-003', 'REL-004', 'REL-005', 'REL-006', 'RTE-001', 'RTE-002', 'RTE-003', 'RTE-004']) {
      expect(ruleFindings(rule, base), rule).toEqual([]);
    }
  });
});

describe('mechanisms', () => {
  it('MEC-001 (INFO): no variants, or a variant with no steps', () => {
    expect(on('MEC-001', edit(base, 'mechanism', MEC, (m) => { m.variants = []; }), 'mechanism', MEC)).toMatchObject([{ path: 'variants', severity: 'info' }]);
    expect(on('MEC-001', edit(base, 'mechanism', MEC, (m) => { must(m.variants[0]).steps = []; }), 'mechanism', MEC)).toMatchObject([{ path: 'variants[0].steps' }]);
  });

  it('MEC-002 (ERROR): a step species with no ref, label or structure', () => {
    const bad = edit(base, 'mechanism', MEC, (m) => { must(must(m.variants[0]).steps[0]).species.push({ role: 'reactant' } as never); });
    expect(on('MEC-002', bad, 'mechanism', MEC)).toMatchObject([{ path: expect.stringMatching(/^variants\[0\]\.steps\[0\]\.species\[\d+\]$/) as string, severity: 'error' }]);
  });

  it('MEC-003 (WARNING): arrows with no atom-mapped structure; SMILES maps and molfiles count as carrying maps', () => {
    const strip = (m: Parameters<Parameters<typeof edit<'mechanism'>>[3]>[0]) => { for (const s of must(m.variants[0]).steps[0]?.species ?? []) delete (s as { structure?: unknown }).structure; };
    const bare = edit(base, 'mechanism', MEC, strip);
    expect(on('MEC-003', bare, 'mechanism', MEC).map((f) => f.path)).toContain('variants[0].steps[0].electronMovements');
    const mapped = edit(bare, 'mechanism', MEC, (m) => { must(must(m.variants[0]).steps[0]).species[0] = { role: 'reactant', structure: { format: 'smiles', value: '[CH3:1][Mg]Br' } } as never; });
    expect(on('MEC-003', mapped, 'mechanism', MEC).map((f) => f.path)).not.toContain('variants[0].steps[0].electronMovements');
    const molfile = edit(bare, 'mechanism', MEC, (m) => { must(must(m.variants[0]).steps[0]).species[0] = { role: 'reactant', structure: { format: 'molfile', value: 'x' } } as never; });
    expect(on('MEC-003', molfile, 'mechanism', MEC).map((f) => f.path)).not.toContain('variants[0].steps[0].electronMovements');
    const unmapped = edit(bare, 'mechanism', MEC, (m) => { must(must(m.variants[0]).steps[0]).species[0] = { role: 'reactant', structure: { format: 'smiles', value: 'C[Mg]Br' } } as never; });
    expect(on('MEC-003', unmapped, 'mechanism', MEC).map((f) => f.path)).toContain('variants[0].steps[0].electronMovements');
  });

  it('MEC-004 (WARNING): more than one rate-determining step in a variant', () => {
    const two = edit(base, 'mechanism', MEC, (m) => {
      const steps = must(m.variants[0]).steps;
      steps.push({ ...JSON.parse(JSON.stringify(must(steps[0]))), id: 'mst_second' });
    });
    expect(on('MEC-004', two, 'mechanism', MEC)).toMatchObject([{ path: 'variants[0].steps', data: { count: 2 } }]);
  });
});

describe('caveats', () => {
  it('CAV-001: a caveat with no targets', () => {
    expect(on('CAV-001', edit(base, 'caveat', CAV, (c) => { c.targets = []; }), 'caveat', CAV)).toMatchObject([{ path: 'targets', severity: 'warning' }]);
  });

  it('CAV-002: a role that does not fit the target kind (an affected reagent that is a species)', () => {
    const bad = edit(base, 'caveat', CAV, (c) => { must(c.targets[1]).ref = { kind: 'species', id: 'spc_max-water' } as never; });
    expect(on('CAV-002', bad, 'caveat', CAV)).toMatchObject([{ path: 'targets[1].as', severity: 'warning' }]);
    expect(on('CAV-002', edit(bad, 'caveat', CAV, (c) => { must(c.targets[1]).as = 'context'; }), 'caveat', CAV)).toEqual([]);
  });
});

describe('relationships', () => {
  const rel = (mutate: Parameters<typeof edit<'relationship'>>[3]) => edit(base, 'relationship', REL, mutate);

  it('REL-001: an endpoint kind not allowed for the type, at the endpoint', () => {
    const bad = rel((r) => { r.from = { kind: 'species', id: 'spc_max-water' } as never; });
    expect(on('REL-001', bad, 'relationship', REL)).toMatchObject([{ path: 'from', severity: 'error' }]);
  });

  it('REL-002: from equals to', () => {
    expect(on('REL-002', rel((r) => { r.to = r.from; }), 'relationship', REL)).toMatchObject([{ path: 'to', severity: 'error' }]);
  });

  it('REL-003: symmetric types treat swapped endpoints as duplicates; directed types do not', () => {
    const original = recordOf(base, 'relationship', REL);
    const swapped = { ...cloneAs(original, 'rel_swapped'), from: original.to, to: original.from };
    const dup = add(base, 'relationship', swapped);
    expect(on('REL-003', dup, 'relationship', REL)).toMatchObject([{ path: 'type', related: [{ id: 'rel_swapped' }] }]);
    expect(on('REL-003', dup, 'relationship', 'rel_swapped')).toHaveLength(1);
    const directed = edit(add(base, 'relationship', swapped), 'relationship', REL, (r) => { r.type = 'follows'; delete (r as { reverseKind?: string }).reverseKind; });
    const directed2 = edit(directed, 'relationship', 'rel_swapped', (r) => { r.type = 'follows'; delete (r as { reverseKind?: string }).reverseKind; });
    expect(on('REL-003', directed2, 'relationship', REL)).toEqual([]);
  });

  it('REL-004: reverseKind required on reverse_of and forbidden elsewhere', () => {
    expect(on('REL-004', rel((r) => { delete (r as { reverseKind?: string }).reverseKind; }), 'relationship', REL)).toMatchObject([{ path: 'reverseKind', severity: 'error' }]);
    expect(on('REL-004', rel((r) => { r.type = 'related_to'; }), 'relationship', REL)).toHaveLength(1);
  });

  it('REL-005: a cycle of prerequisite_of relationships flags every link; a chain is fine', () => {
    const link = (id: string, from: string, to: string) => ({ ...cloneAs(recordOf(base, 'relationship', REL), id), type: 'prerequisite_of' as const, from: { kind: 'concept', id: from }, to: { kind: 'concept', id: to }, reverseKind: undefined });
    const ids = ['cpt_max-elimination', 'cpt_max-carbonyl-addition', 'cpt_max-carbocation-stability'];
    const strip = (r: ReturnType<typeof link>) => { const { reverseKind: _unused, ...rest } = r; return rest as never; };
    let chain = add(base, 'relationship', strip(link('rel_link-a', ids[0] as string, ids[1] as string)));
    chain = add(chain, 'relationship', strip(link('rel_link-b', ids[1] as string, ids[2] as string)));
    expect(ruleFindings('REL-005', chain)).toEqual([]);
    const cycle = add(chain, 'relationship', strip(link('rel_link-c', ids[2] as string, ids[0] as string)));
    expect(ruleFindings('REL-005', cycle).map((f) => f.subject.id).sort()).toEqual(['rel_link-a', 'rel_link-b', 'rel_link-c']);
    expect(ruleFindings('REL-005', cycle)[0]).toMatchObject({ path: 'type', severity: 'error' });
  });

  it('REL-006: a microscopic reverse of an irreversible reaction', () => {
    const micro = rel((r) => { r.reverseKind = 'microscopic'; });
    expect(on('REL-006', micro, 'relationship', REL)).toEqual([]);
    const irreversible = edit(micro, 'reaction', DEHYD, (r) => { r.reversibility = { kind: 'irreversible' } as never; });
    expect(on('REL-006', irreversible, 'relationship', REL)).toMatchObject([{ path: 'reverseKind', severity: 'warning', related: [{ id: DEHYD }] }]);
    expect(on('REL-006', edit(irreversible, 'relationship', REL, (r) => { r.reverseKind = 'synthetic'; }), 'relationship', REL)).toEqual([]);
    expect(ends.kind).toBe('reaction');
  });
});

describe('routes', () => {
  const route = (mutate: Parameters<typeof edit<'route'>>[3], state = base) => edit(state, 'route', ROUTE, mutate);
  const inputs = (r: Parameters<Parameters<typeof edit<'route'>>[3]>[0], step: number, ids: string[]) => { must(r.steps[step]).inputFromStepIds = ids as never; };

  it('RTE-001: a step listing itself, and a cycle through two steps', () => {
    expect(on('RTE-001', route((r) => inputs(r, 0, [S1])), 'route', ROUTE)).toMatchObject([{ path: 'steps[0].inputFromStepIds', severity: 'error' }, { path: 'steps[1].inputFromStepIds' }].slice(0, 1));
    const cyc = on('RTE-001', route((r) => inputs(r, 0, [S2])), 'route', ROUTE);
    expect(cyc.map((f) => f.path)).toEqual(['steps[0].inputFromStepIds', 'steps[1].inputFromStepIds']);
  });

  it('RTE-002: an input whose products feed none of the step reactants; a class reactant accepts its members', () => {
    const wrong = route((r) => { must(r.steps[1]).reactionId = HYDR as never; delete (must(r.steps[1]) as { outcomeId?: string }).outcomeId; });
    expect(on('RTE-002', wrong, 'route', ROUTE)).toMatchObject([{ path: 'steps[1].inputFromStepIds[0]', severity: 'warning' }]);
    const viaClass = edit(wrong, 'reaction', HYDR, (r) => { for (const p of r.participants) if (p.role === 'reactant') p.ref = { kind: 'class', id: 'cls_max-alcohols' } as never; });
    expect(on('RTE-002', viaClass, 'route', ROUTE)).toEqual([]);
  });

  it('RTE-002 follows edits to the reaction that a step uses', () => {
    const changed = edit(base, 'reaction', DEHYD, (r) => { for (const p of r.participants) if (p.role === 'reactant') p.ref = { kind: 'species', id: 'spc_max-water' } as never; });
    expect(on('RTE-002', changed, 'route', ROUTE)).toHaveLength(1);
  });

  it('RTE-003: no steps is a WARNING for a draft and an ERROR when published', () => {
    const empty = route((r) => { r.steps = []; r.review.lifecycle = 'draft'; });
    expect(on('RTE-003', empty, 'route', ROUTE)).toMatchObject([{ path: 'steps', severity: 'warning' }]);
    expect(on('RTE-003', route((r) => { r.steps = []; r.review.lifecycle = 'published'; }), 'route', ROUTE)[0]?.severity).toBe('error');
  });

  it('RTE-004: the target must be produced by a final step, exactly or by class', () => {
    expect(on('RTE-004', route((r) => { r.target = { kind: 'species', id: 'spc_max-butan-2-ol' } as never; }), 'route', ROUTE)).toMatchObject([{ path: 'target', related: [{ id: 'spc_max-butan-2-ol' }] }]);
    expect(on('RTE-004', route((r) => { r.target = { kind: 'class', id: 'cls_max-alkenes' } as never; }), 'route', ROUTE)).toEqual([]);
    expect(on('RTE-004', route((r) => { delete (r as { target?: unknown }).target; }), 'route', ROUTE)).toEqual([]);
  });
});
