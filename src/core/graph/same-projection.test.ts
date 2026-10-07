/** `sameProjection` (step 5.4c, decision Q3): equal apart from revision and key, and nothing else. */
import { describe, expect, it } from 'vitest';
import { navigatorProjection, sameProjection, type Projection } from '.';
import { documentToState } from '@/core/dataset';
import { buildDemoDocument } from '@/test-support/demo';
import { contextOf, requestOf } from '@/test-support/graph-state';

const parsed = documentToState(buildDemoDocument());
if (!parsed.ok) throw new Error('duplicate IDs');
const base = navigatorProjection.build(contextOf(parsed.state), requestOf('navigator'));
const copy = (over: Partial<Projection> = {}): Projection => ({ ...(JSON.parse(JSON.stringify(base)) as Projection), ...over });

describe('sameProjection', () => {
  it('a projection equals itself, and a deep copy equals it', () => {
    expect(base.nodes.length).toBeGreaterThan(5);
    expect(sameProjection(base, base)).toBe(true);
    expect(sameProjection(base, copy())).toBe(true);
  });

  it('revision and key are ignored', () => {
    expect(sameProjection(base, copy({ revision: base.revision + 7, key: 'prj_other' }))).toBe(true);
  });

  it('a different view, node, edge, bundle, unanchored list or truncation is different', () => {
    expect(sameProjection(base, copy({ view: 'reaction_explorer' }))).toBe(false);
    expect(sameProjection(base, copy({ nodes: base.nodes.slice(1) }))).toBe(false);
    expect(sameProjection(base, copy({ edges: base.edges.slice(1) }))).toBe(false);
    expect(sameProjection(base, copy({ unanchoredReactionIds: [...base.unanchoredReactionIds, 'rxn_extra' as never] }))).toBe(false);
    expect(sameProjection(base, copy({ truncation: { reason: 'max_edges', hiddenNodeEstimate: 0 } }))).toBe(false);
    expect(sameProjection(base, copy({ bundles: [] }))).toBe(base.bundles.length === 0);
  });

  it('a change deep inside one record is seen: a flag, a hidden count, a variant ID, an edge field', () => {
    const edge = base.edges[0];
    const node = base.nodes[0];
    if (edge === undefined || node === undefined) throw new Error('the demo navigator has nodes and edges');
    const swap = (edges: Projection['edges']): Projection => copy({ edges });
    expect(sameProjection(base, swap([{ ...edge, inferred: !edge.inferred }, ...base.edges.slice(1)]))).toBe(false);
    expect(sameProjection(base, swap([{ ...edge, conditionVariantIds: [...edge.conditionVariantIds, 'cvr_zz' as never] }, ...base.edges.slice(1)]))).toBe(false);
    expect(sameProjection(base, copy({ nodes: [{ ...node, hidden: { outgoing: node.hidden.outgoing + 1, incoming: node.hidden.incoming } }, ...base.nodes.slice(1)] }))).toBe(false);
    expect(sameProjection(base, copy({ nodes: [{ ...node, flags: [...node.flags, 'has_error'] }, ...base.nodes.slice(1)] }))).toBe(false);
  });

  it('a bundle total is part of the projection', () => {
    const bundle = base.bundles[0];
    if (bundle === undefined) throw new Error('the demo navigator has bundles');
    expect(sameProjection(base, copy({ bundles: [{ ...bundle, total: bundle.total + 1 }, ...base.bundles.slice(1)] }))).toBe(false);
  });

  it('an optional field that is undefined equals one that is absent; order inside a list matters', () => {
    const node = base.nodes[0];
    if (node === undefined) throw new Error('the demo navigator has nodes');
    expect(sameProjection(base, copy({ nodes: [{ ...node, hiddenMembers: undefined }, ...base.nodes.slice(1)] }))).toBe(true);
    expect(sameProjection(base, copy({ nodes: [...base.nodes].reverse() }))).toBe(false);
  });
});
