/**
 * Navigator at scale (step 5.4c): the step 5.0 fact-sheet scenarios under the per-pair overview. Every pair is
 * admitted or reported, a bundle knows its full total (largest 752 at the design tier, dense), a hub explosion is
 * ONE pair of 1,000 / 5,000 arrows with no truncation, and the totals always add up (INV-22).
 */
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_DEGREE_CAP, navigatorProjection, UNCLASSIFIED_HUB_ID, type Projection } from '@/core/graph';
import { documentToState } from '@/core/dataset';
import type { CanonicalState } from '@/core/schema';
import { buildDemoDocument } from '@/test-support/demo';
import { contextOf, requestOf } from '@/test-support/graph-state';
import { tierState, withNavigatorAnchors } from '@/test-support/perf-kit';
import { checkInv26, checkStructure } from '@/test-support/projection-harness';

vi.setConfig({ testTimeout: 120_000 });

interface Scenario {
  readonly projection: Projection;
  readonly candidates: number;
  readonly pairs: number;
}

/** Builds the default request and counts candidates and distinct ordered pairs straight from the roll-up. */
function scenario(state: CanonicalState): Scenario {
  const ctx = contextOf(state);
  const request = requestOf('navigator');
  const projection = navigatorProjection.build(ctx, request);
  expect([...checkStructure(projection, request, state, ctx.indexes.revision), ...checkInv26(projection, state)]).toEqual([]);
  const rollup = ctx.indexes.navigatorRollup();
  const pairs = new Set<string>();
  let candidates = 0;
  for (const hub of [...rollup.hubs.map((h) => h.id), UNCLASSIFIED_HUB_ID]) {
    for (const c of rollup.candidatesFrom(hub)) {
      pairs.add(`${c.fromHub}>${c.toHub}`);
      candidates += 1;
    }
  }
  return { projection, candidates, pairs: pairs.size };
}

const largest = (p: Projection): number => p.bundles.reduce((max, b) => Math.max(max, b.total), 1);
/** Arrows the projection accounts for: bundle totals plus the single-edge pairs, plus the hidden candidates. */
function accounted(p: Projection): number {
  const bundled = new Set(p.bundles.flatMap((b) => b.edgeIds));
  return p.bundles.reduce((s, b) => s + b.total, 0) + p.edges.filter((e) => !bundled.has(e.id)).length + (p.truncation?.hiddenEdges ?? 0);
}

describe('the demo', () => {
  it('keeps every arrow: 16 nodes, 35 edges, 6 bundles of up to 4, no truncation', () => {
    const parsed = documentToState(buildDemoDocument());
    if (!parsed.ok) throw new Error('duplicate IDs');
    const { projection, candidates, pairs } = scenario(parsed.state);
    expect(candidates).toBe(35);
    expect(pairs).toBe(26);
    expect([projection.nodes.length, projection.edges.length, projection.bundles.length, largest(projection)]).toEqual([16, 35, 6, 4]);
    expect(projection.truncation).toBeNull();
    expect(accounted(projection)).toBe(35);
  });
});

describe('initial tier (1,000 reactions)', () => {
  it('dense, 60 anchors asked: 1,026 pairs, 800 drawn and 226 reported with their arrows', () => {
    const { projection, candidates, pairs } = scenario(withNavigatorAnchors(tierState('initial', 'dense')));
    expect([candidates, pairs]).toEqual([1502, 1026]);
    expect([projection.nodes.length, projection.edges.length, largest(projection)]).toEqual([50, 800, 6]);
    expect(projection.truncation).toMatchObject({ reason: 'max_edges', hiddenPairs: 226, hiddenEdges: 226 });
    expect(accounted(projection)).toBe(candidates);
  });

  it('dense, no anchors: every arrow is on Unclassified, ONE loop pair with its full total, no truncation', () => {
    const { projection } = scenario(tierState('initial', 'dense'));
    expect(projection.bundles).toHaveLength(1);
    expect(projection.bundles[0]).toMatchObject({ from: UNCLASSIFIED_HUB_ID, to: UNCLASSIFIED_HUB_ID, total: 1502 });
    expect(projection.edges).toHaveLength(DEFAULT_DEGREE_CAP);
    expect(projection.truncation).toBeNull();
  });

  it('hub_explosion: ONE pair of 1,000 arrows, no truncation', () => {
    const { projection } = scenario(withNavigatorAnchors(tierState('initial', 'hub_explosion')));
    expect(projection.bundles).toHaveLength(1);
    expect(projection.bundles[0]?.total).toBe(1000);
    expect(projection.edges).toHaveLength(DEFAULT_DEGREE_CAP);
    expect(projection.truncation).toBeNull();
  });
});

describe('design tier (5,000 reactions)', () => {
  it('dense, 60 anchored hubs: 1,702 pairs, the largest bundle knows its 752 arrows, 902 pairs reported', () => {
    const { projection, candidates, pairs } = scenario(withNavigatorAnchors(tierState('design', 'dense')));
    expect([candidates, pairs]).toEqual([7492, 1702]);
    expect([projection.nodes.length, projection.edges.length, largest(projection)]).toEqual([60, 800, 752]);
    expect(projection.truncation).toMatchObject({ reason: 'max_edges', hiddenPairs: 902 });
    expect(accounted(projection)).toBe(candidates);
  });

  it('hub_explosion: ONE pair of 5,000 arrows, no truncation, the degree cap of edges drawn', () => {
    const { projection } = scenario(withNavigatorAnchors(tierState('design', 'hub_explosion')));
    expect(projection.bundles.map((b) => b.total)).toEqual([5000]);
    expect(projection.edges).toHaveLength(DEFAULT_DEGREE_CAP);
    expect(projection.truncation).toBeNull();
  });
});
