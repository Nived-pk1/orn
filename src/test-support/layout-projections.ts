/**
 * Real projections turned into layout requests for the layout tests and bench (step 4.4): the demo's and the design tier's
 * navigator, reaction explorer and precursor explorer. Sizes are fixed (`projectionRequest`); the real Scene mapping is Phase 5.
 * Test code only. The design tier is built once per process (it is large) and shared.
 */
import { navigatorProjection, precursorExplorerProjection, reactionExplorerProjection, type Projection } from '@/core/graph';
import type { CanonicalState, RecordRef } from '@/core/schema';
import type { LayoutRequest } from '@/layout/contracts';
import { demoRecords } from './legacy-classify-kit';
import { stateOfRecords } from './legacy-map-kit';
import { contextOf, requestOf } from './graph-state';
import { projectionRequest } from './layout-kit';
import { buildIndexes, mostReferencedSpecies, tierState, withNavigatorAnchors } from './perf-kit';

export interface NamedLayoutRequest {
  readonly name: string;
  readonly request: LayoutRequest;
  readonly projection: Projection;
}

function projectionsOf(state: CanonicalState, focus: RecordRef, reaction?: RecordRef): readonly (readonly [string, Projection])[] {
  const ctx = contextOf(state);
  const focused = requestOf('navigator', { focus: [focus] });
  return [
    ['navigator', navigatorProjection.build(ctx, { ...requestOf('navigator'), view: 'navigator' })],
    ['navigator, focused', navigatorProjection.build(ctx, { ...focused, view: 'navigator' })],
    ['reaction explorer', reactionExplorerProjection.build(ctx, { ...requestOf('reaction_explorer', { focus: [reaction ?? focus] }), view: 'reaction_explorer' })],
    ['precursor explorer', precursorExplorerProjection.build(ctx, { ...requestOf('precursor_explorer', { focus: [focus] }), view: 'precursor_explorer' })],
  ];
}

function named(prefix: string, projections: readonly (readonly [string, Projection])[]): NamedLayoutRequest[] {
  return projections
    .filter(([, projection]) => projection.nodes.length > 0)
    .map(([name, projection]) => ({ name: `${prefix}: ${name} (${projection.nodes.length} nodes, ${projection.edges.length} edges)`, request: projectionRequest(projection), projection }));
}

/** The demo dataset's projections. Focus: its most referenced species; reaction: its first reaction by id. */
export function demoLayoutRequests(): NamedLayoutRequest[] {
  const state = stateOfRecords(demoRecords());
  const hub = mostReferencedSpecies(state, buildIndexes(state));
  const reactionId = Object.keys(state.records.reaction).sort()[0];
  return named('demo', projectionsOf(state, hub, reactionId === undefined ? undefined : { kind: 'reaction', id: reactionId }));
}

let design: NamedLayoutRequest[] | undefined;

/** The design tier's projections (dense and hub_explosion shapes), bounded by the traversal limits (400 nodes / 800 edges). */
export function designLayoutRequests(): NamedLayoutRequest[] {
  if (design !== undefined) return design;
  const out: NamedLayoutRequest[] = [];
  for (const shape of ['dense', 'hub_explosion'] as const) {
    const state = withNavigatorAnchors(tierState('design', shape));
    const hub = mostReferencedSpecies(state, buildIndexes(state));
    out.push(...named(`design/${shape}`, projectionsOf(state, hub)));
  }
  design = out;
  return out;
}
