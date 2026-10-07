/**
 * Projection harness (docs/TEST_STRATEGY.md P-10, INV-26). It runs over every projection in a registry:
 *  - P-10: the same state and request give a byte-identical projection, even when the state's records are
 *    inserted in the opposite order and the indexes are rebuilt from scratch;
 *  - INV-26: every edge that names a reaction maps to exactly one real participation or production of that
 *    reaction, and no two edges claim the same one, whatever their endpoints;
 *  - structure: sorted unique IDs, edge endpoints exist, bundles reference real edges, limits respected (INV-22).
 * It returns violations as data so tests print all of them at once.
 */
import { graphEdgeId, type GraphEdge, type Projection, type ProjectionDefinition, type ProjectionRegistry, type ProjectionRequest } from '@/core/graph';
import { RECORD_KINDS, type CanonicalState, type RecordKind } from '@/core/schema';
import { contextOf, type ScopeOf } from './graph-state';

export interface Violation {
  readonly view: string;
  readonly rule: string;
  readonly detail: string;
}

/** The same records with every table inserted in reverse key order. */
export function reversedState(state: CanonicalState): CanonicalState {
  const records = {} as Record<RecordKind, Record<string, unknown>>;
  for (const kind of RECORD_KINDS) records[kind] = Object.fromEntries(Object.entries(state.records[kind]).reverse());
  return { meta: state.meta, records: records as unknown as CanonicalState['records'] };
}

const strictlyAscending = (ids: readonly string[]): boolean => ids.every((id, i) => i === 0 || (ids[i - 1] as string) < id);

export function checkStructure(p: Projection, request: ProjectionRequest, state: CanonicalState, revision: number): Violation[] {
  const out: Violation[] = [];
  const bad = (rule: string, detail: string): number => out.push({ view: p.view, rule, detail });
  if (p.view !== request.view) bad('view', `projection view ${p.view} for request ${request.view}`);
  if (p.revision !== revision) bad('revision', `revision ${p.revision}, expected ${revision}`);
  if (!p.key.startsWith('prj_')) bad('key', p.key);
  if (!strictlyAscending(p.nodes.map((n) => n.id))) bad('nodes-sorted', 'node IDs are not strictly ascending');
  if (!strictlyAscending(p.edges.map((e) => e.id))) bad('edges-sorted', 'edge IDs are not strictly ascending');
  const nodeIds = new Set(p.nodes.map((n) => n.id));
  const edgeById = new Map(p.edges.map((e) => [e.id, e]));
  for (const e of p.edges) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) bad('edge-endpoints', `${e.id}: ${e.from} → ${e.to}`);
  }
  for (const b of p.bundles) {
    for (const id of b.edgeIds) {
      const e = edgeById.get(id);
      if (e === undefined) bad('bundle-edges', `${b.id} names unknown edge ${id}`);
      else if (e.from !== b.from || e.to !== b.to) bad('bundle-endpoints', `${b.id} vs ${id}`);
    }
    if (b.total < b.edgeIds.length) bad('bundle-total', `${b.id}: total ${b.total} < ${b.edgeIds.length} drawn edges`);
    if (b.edgeIds.length === 0) bad('bundle-empty', b.id);
  }
  if (p.nodes.length > request.limits.maxNodes) bad('INV-22-nodes', `${p.nodes.length} > ${request.limits.maxNodes}`);
  if (p.edges.length > request.limits.maxEdges) bad('INV-22-edges', `${p.edges.length} > ${request.limits.maxEdges}`);
  if (!strictlyAscending(p.unanchoredReactionIds)) bad('unanchored-sorted', 'not strictly ascending');
  for (const id of p.unanchoredReactionIds) if (state.records.reaction[id] === undefined) bad('unanchored-real', id);
  return out;
}

/** The tuple that says which participation or production an edge stands for (endpoints excluded). */
function claimOf(e: GraphEdge): string | undefined {
  if (e.reactionId === undefined) return undefined;
  return [e.semantic, e.reactionId, e.outcomeId ?? '', e.productId ?? '', e.participantId ?? ''].join('|');
}

export function checkInv26(p: Projection, state: CanonicalState): Violation[] {
  const out: Violation[] = [];
  const bad = (detail: string): number => out.push({ view: p.view, rule: 'INV-26', detail });
  const claims = new Map<string, string>();
  const ids = new Set<string>();
  for (const e of p.edges) {
    if (ids.has(e.id)) bad(`duplicate edge ID ${e.id}`);
    ids.add(e.id);
    if (e.id !== graphEdgeId({ ...e, view: p.view })) bad(`${e.id} is not the hash of its identity`);
    const claim = claimOf(e);
    if (claim === undefined) continue;
    const earlier = claims.get(claim);
    if (earlier !== undefined) bad(`${e.id} and ${earlier} both stand for ${claim} (edges merged or repeated by endpoints)`);
    claims.set(claim, e.id);
    const reaction = e.reactionId === undefined ? undefined : state.records.reaction[e.reactionId];
    if (reaction === undefined) {
      bad(`${e.id} names unknown reaction ${String(e.reactionId)}`);
      continue;
    }
    if (e.participantId !== undefined && !reaction.participants.some((x) => x.id === e.participantId)) {
      bad(`${e.id}: ${e.participantId} is not a participant of ${reaction.id}`);
    }
    if (e.productId !== undefined) {
      const outcome = reaction.outcomes.find((o) => o.id === e.outcomeId);
      if (outcome === undefined || !outcome.products.some((x) => x.id === e.productId)) {
        bad(`${e.id}: ${e.productId} is not a product of outcome ${String(e.outcomeId)} of ${reaction.id}`);
      }
    }
  }
  return out;
}

/** P-10. `scopeOf` must be the same function for both builds. */
export function checkDeterminism(definition: ProjectionDefinition, state: CanonicalState, request: ProjectionRequest, scopeOf?: ScopeOf): Violation[] {
  const a = contextOf(state, 1, scopeOf);
  const first = JSON.stringify(definition.build(a, request));
  const again = JSON.stringify(definition.build(a, request));
  const rebuilt = JSON.stringify(definition.build(contextOf(reversedState(state), 1, scopeOf), request));
  const out: Violation[] = [];
  if (first !== again) out.push({ view: definition.view, rule: 'P-10', detail: 'two builds from the same context differ' });
  if (first !== rebuilt) out.push({ view: definition.view, rule: 'P-10', detail: 'building from reordered records and fresh indexes differs' });
  return out;
}

export function checkProjection(definition: ProjectionDefinition, state: CanonicalState, request: ProjectionRequest, scopeOf?: ScopeOf): Violation[] {
  const ctx = contextOf(state, 1, scopeOf);
  const projection = definition.build(ctx, request);
  return [
    ...checkStructure(projection, request, state, ctx.indexes.revision),
    ...checkInv26(projection, state),
    ...checkDeterminism(definition, state, request, scopeOf),
  ];
}

/** Runs every registered projection over every request that names its view (or any view, when `requests` are view-agnostic). */
export function checkRegistry(
  registry: ProjectionRegistry,
  state: CanonicalState,
  requestsFor: (view: ProjectionRequest['view']) => readonly ProjectionRequest[],
  scopeOf?: ScopeOf,
): Violation[] {
  return registry.definitions().flatMap((definition) => requestsFor(definition.view).flatMap((request) => checkProjection(definition, state, request, scopeOf)));
}
