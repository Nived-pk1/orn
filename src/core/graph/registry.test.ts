import { describe, expect, it } from 'vitest';
import { VIEW_KEYS } from '../schema';
import { requestOf, stateOf, contextOf } from '@/test-support/graph-state';
import type { Projection, ProjectionDefinition } from './contracts';
import { createDefaultProjectionRegistry, defaultProjectionDefinitions } from './defaults';
import { createProjectionRegistry } from './registry';

const empty = (view: ProjectionDefinition['view']): Projection => ({ view, revision: 0, key: 'prj_x', nodes: [], edges: [], bundles: [], unanchoredReactionIds: [], truncation: null });
const stub = (view: ProjectionDefinition['view']): ProjectionDefinition => ({ view, description: `stub ${view}`, build: () => empty(view) });

describe('projection registry', () => {
  it('registers by view, lists in VIEW_KEYS order and returns definitions', () => {
    const registry = createProjectionRegistry([stub('syllabus'), stub('navigator')]);
    expect(registry.views()).toEqual(['navigator', 'syllabus']);
    expect(registry.definitions().map((d) => d.view)).toEqual(['navigator', 'syllabus']);
    expect(registry.has('navigator')).toBe(true);
    expect(registry.has('search')).toBe(false);
    expect(registry.get('search')).toBeUndefined();
  });

  it('adding a view leaves the others untouched', () => {
    const registry = createProjectionRegistry([stub('navigator')]);
    const before = registry.get('navigator');
    registry.register(stub('mechanisms'));
    expect(registry.get('navigator')).toBe(before);
    expect(registry.views()).toEqual(['navigator', 'mechanisms']);
  });

  it('registering a view twice is a programmer error', () => {
    const registry = createProjectionRegistry([stub('navigator')]);
    expect(() => registry.register(stub('navigator'))).toThrow(/already registered/);
  });

  it('build dispatches by request view; an unregistered view is a value, not an exception', () => {
    const registry = createProjectionRegistry([stub('navigator')]);
    const ctx = contextOf(stateOf());
    expect(registry.build(ctx, requestOf('navigator'))).toEqual({ ok: true, projection: empty('navigator') });
    expect(registry.build(ctx, requestOf('search'))).toEqual({ ok: false, reason: 'unregistered_view', view: 'search' });
  });

  it('the default registry holds exactly the shipped definitions, each for a real ViewKey', () => {
    const registry = createDefaultProjectionRegistry();
    expect(registry.views()).toEqual(defaultProjectionDefinitions().map((d) => d.view));
    expect(registry.views()).toContain('navigator');
    for (const view of registry.views()) expect(VIEW_KEYS).toContain(view);
  });
});
