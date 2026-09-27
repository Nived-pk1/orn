/**
 * Small states and projection contexts for graph tests. Test-only. Records come from the demo builders
 * (`kit`, `reaction-kit`), so they are schema-valid; nothing here is chemistry logic.
 */
import { emptyRecordTables, type AnyRecord, type CanonicalState, type EntityDisplay, type NavigatorAnchor, type RecordRef } from '@/core/schema';
import { DEFAULT_TRAVERSAL_LIMITS, type ProjectionContext, type ProjectionRequest } from '@/core/graph';
import { indexEngine } from '@/core/indexes';
import { ident, presentationMeta } from './demo/kit';
import { loadFixtureState } from './state-fixture';

export { chemClass, species, reagent, sp, cl, rg } from './demo/kit';
export { reaction } from './demo/reaction-kit';

/** A state holding exactly `records`. */
export function stateOf(...records: readonly AnyRecord[]): CanonicalState {
  const tables = emptyRecordTables() as unknown as Record<string, Record<string, AnyRecord>>;
  for (const record of records) (tables[record.kind] as Record<string, AnyRecord>)[record.id] = record;
  return { meta: loadFixtureState('minimal-valid').meta, records: tables as unknown as CanonicalState['records'] };
}

export const anchorOn = (target: RecordRef, body: string): NavigatorAnchor => ({
  id: ident<NavigatorAnchor['id']>('anc', body),
  kind: 'navigator_anchor',
  target,
  order: 1,
  ...presentationMeta,
});

export const neverAsNode = (target: RecordRef, body: string): EntityDisplay => ({
  id: ident<EntityDisplay['id']>('edp', body),
  kind: 'entity_display',
  target,
  showAsNode: 'never',
  ...presentationMeta,
});

export type ScopeOf = ProjectionContext['scopeOf'];

export function contextOf(state: CanonicalState, revision = 1, scopeOf: ScopeOf = () => 'unmapped'): ProjectionContext {
  return { state, indexes: indexEngine.build(state, revision), scopeOf };
}

export function requestOf(view: ProjectionRequest['view'], over: Partial<ProjectionRequest> = {}): ProjectionRequest {
  return {
    view,
    focus: [],
    expansion: { expanded: [], collapsedEdgeIds: [] },
    filters: { scopes: [], topicIds: [], reagentFamilies: [] },
    limits: DEFAULT_TRAVERSAL_LIMITS,
    ...over,
  };
}
