/**
 * Projection registry (docs/GRAPH_SEMANTICS.md §7). Views are registered by `ViewKey`; adding a view adds
 * a definition and never edits another projection. Failures are values: an unregistered view is
 * `{ ok: false }`, a duplicate registration is a programmer error and throws.
 */
import { VIEW_KEYS, type ViewKey } from '../schema';
import type { Projection, ProjectionContext, ProjectionDefinition, ProjectionRequest } from './contracts';

export type BuildProjectionResult =
  | { readonly ok: true; readonly projection: Projection }
  | { readonly ok: false; readonly reason: 'unregistered_view'; readonly view: ViewKey };

export interface ProjectionRegistry {
  /** Throws when `definition.view` is already registered. */
  register(definition: ProjectionDefinition): void;
  has(view: ViewKey): boolean;
  get(view: ViewKey): ProjectionDefinition | undefined;
  /** Registered views in `VIEW_KEYS` order. */
  views(): readonly ViewKey[];
  definitions(): readonly ProjectionDefinition[];
  build(ctx: ProjectionContext, request: ProjectionRequest): BuildProjectionResult;
}

export function createProjectionRegistry(initial: readonly ProjectionDefinition[] = []): ProjectionRegistry {
  const byView = new Map<ViewKey, ProjectionDefinition>();
  const registry: ProjectionRegistry = {
    register(definition) {
      if (byView.has(definition.view)) throw new Error(`projection for view "${definition.view}" is already registered`);
      byView.set(definition.view, definition);
    },
    has: (view) => byView.has(view),
    get: (view) => byView.get(view),
    views: () => VIEW_KEYS.filter((view) => byView.has(view)),
    definitions: () => VIEW_KEYS.flatMap((view) => byView.get(view) ?? []),
    build(ctx, request) {
      const definition = byView.get(request.view);
      if (definition === undefined) return { ok: false, reason: 'unregistered_view', view: request.view };
      return { ok: true, projection: definition.build(ctx, request) };
    },
  };
  for (const definition of initial) registry.register(definition);
  return registry;
}
