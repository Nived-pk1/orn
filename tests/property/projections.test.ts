/**
 * P-10 and INV-26 over EVERY registered projection (docs/TEST_STRATEGY.md §4): the demo, the maximal
 * fixture and generated datasets of every shape, with anchors added to some classes and requests that
 * vary filters and limits. A projection added to the default registry is covered without editing this file.
 */
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultProjectionRegistry, DEFAULT_TRAVERSAL_LIMITS, type ProjectionRequest } from '@/core/graph';
import { documentToState } from '@/core/dataset';
import { hash64 } from '@/core/hash';
import { indexEngine } from '@/core/indexes';
import { emptyRecordTables, RECORD_KINDS, type AnyRecord, type CanonicalState, type ViewKey } from '@/core/schema';
import { anchorOn, neverAsNode, requestOf, type ScopeOf } from '@/test-support/graph-state';
import { GENERATOR_SHAPES, generateTier, type GeneratorShape } from '@/test-support/generator';
import { buildDemoDocument } from '@/test-support/demo';
import { checkRegistry, type Violation } from '@/test-support/projection-harness';
import { loadFixtureState } from '@/test-support/state-fixture';
import { PARAMS, TIMEOUT_MS } from './harness';

vi.setConfig({ testTimeout: TIMEOUT_MS });

const registry = createDefaultProjectionRegistry();

/** A stable pseudo-random scope per record, so scope filters select something on any dataset. */
const scopeOf: ScopeOf = (ref) => (['official', 'prerequisite', 'enrichment', 'outside', 'unmapped'] as const)[Number.parseInt(hash64(ref.id).slice(0, 4), 16) % 5] as ReturnType<ScopeOf>;

/** Adds anchors to every second class and hides every seventh species from node display (presentation only). */
function withPresentation(state: CanonicalState): CanonicalState {
  const records = { ...emptyRecordTables() } as unknown as Record<string, Record<string, AnyRecord>>;
  for (const kind of RECORD_KINDS) records[kind] = { ...state.records[kind] };
  Object.keys(state.records.class).sort().forEach((id, i) => {
    if (i % 2 === 0) {
      const anchor = anchorOn({ kind: 'class', id }, `p-${id.slice(4)}`.slice(0, 60));
      (records['navigator_anchor'] as Record<string, AnyRecord>)[anchor.id] = anchor;
    }
  });
  Object.keys(state.records.species).sort().forEach((id, i) => {
    if (i % 7 === 3) {
      const display = neverAsNode({ kind: 'species', id }, `n-${id.slice(4)}`.slice(0, 60));
      (records['entity_display'] as Record<string, AnyRecord>)[display.id] = display;
    }
  });
  return { meta: state.meta, records: records as unknown as CanonicalState['records'] };
}

const requestsFor = (view: ViewKey): ProjectionRequest[] => [
  requestOf(view),
  requestOf(view, { filters: { scopes: ['official', 'prerequisite'], topicIds: [], reagentFamilies: [] } }),
  requestOf(view, { filters: { scopes: [], topicIds: [], reagentFamilies: ['oxidant', 'base'], text: 'reaction' } }),
  requestOf(view, { limits: { ...DEFAULT_TRAVERSAL_LIMITS, maxNodes: 5, maxEdges: 7 } }),
  requestOf(view, { limits: { ...DEFAULT_TRAVERSAL_LIMITS, maxNodes: 0, maxEdges: 0 } }),
];

const describeViolations = (violations: readonly Violation[]): string[] => violations.slice(0, 8).map((v) => `${v.view} ${v.rule}: ${v.detail}`);

function stateFor(shape: GeneratorShape, seed: number): CanonicalState {
  const parsed = documentToState(generateTier('tiny', shape, seed));
  if (!parsed.ok) throw new Error('generator produced duplicate IDs');
  return withPresentation(parsed.state);
}

describe('P-10 / INV-26 over every registered projection', () => {
  it('the registry is not empty and includes the navigator', () => {
    expect(registry.views()).toContain('navigator');
  });

  it.each([
    ['demo', () => documentToState(buildDemoDocument())],
    ['maximal fixture', () => ({ ok: true as const, state: loadFixtureState('maximal-valid') })],
  ])('%s: no violations for any registered view or request', (_name, load) => {
    const loaded = load();
    if (!loaded.ok) throw new Error('duplicate IDs');
    for (const state of [loaded.state, withPresentation(loaded.state)]) {
      expect(describeViolations(checkRegistry(registry, state, requestsFor, scopeOf))).toEqual([]);
    }
  });

  it('the demo navigator is not vacuous: its anchors are hubs, arrows are drawn and INV-26 holds for multi-product reactions', () => {
    const parsed = documentToState(buildDemoDocument());
    if (!parsed.ok) throw new Error('duplicate IDs');
    const built = registry.build({ state: parsed.state, indexes: indexEngine.build(parsed.state, 1), scopeOf }, requestOf('navigator'));
    if (!built.ok) throw new Error('navigator not registered');
    const p = built.projection;
    expect(p.nodes.filter((n) => n.role === 'anchor')).toHaveLength(Object.keys(parsed.state.records.navigator_anchor).length);
    expect(p.edges.length).toBeGreaterThan(20);
    expect(p.edges.some((e) => e.inferred)).toBe(true);
    const reactions = new Set(p.edges.map((e) => e.reactionId));
    for (const id of Object.keys(parsed.state.records.reaction)) expect(reactions.has(id as never) || p.unanchoredReactionIds.includes(id as never), id).toBe(true);
    expect(p.truncation).toBeNull();
  });

  it.each(GENERATOR_SHAPES)('generated %s dataset: no violations', (shape) => {
    expect(describeViolations(checkRegistry(registry, stateFor(shape, 7), requestsFor, scopeOf))).toEqual([]);
  });

  it('random shapes, seeds and limits: no violations', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...GENERATOR_SHAPES),
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: 0, max: 80 }),
        (shape, seed, maxNodes, maxEdges) => {
          const request = (view: ViewKey) => requestOf(view, { limits: { ...DEFAULT_TRAVERSAL_LIMITS, maxNodes, maxEdges } });
          const violations = checkRegistry(registry, stateFor(shape, seed), (view) => [request(view)], scopeOf);
          expect(describeViolations(violations)).toEqual([]);
        },
      ),
      { ...PARAMS, numRuns: Math.max(5, Math.floor(PARAMS.numRuns / 3)) },
    );
  });
});
