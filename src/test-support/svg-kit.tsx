/**
 * Test kit for the SVG renderer (step 5.4a): the demo navigator Scene (fake measurer, pure fallback layout: deterministic), small
 * hand-made Scenes, a stub depiction source, a render helper with counters. Test code only.
 */
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { documentToState } from '@/core/dataset';
import { navigatorProjection, UNCLASSIFIED_HUB_ID, type GraphEdge, type GraphNode, type Projection, type ProjectionRequest } from '@/core/graph';
import type { LodLevel, Scene, SceneEdge, SceneNode } from '@/render/scene';
import { SceneSvg, type DepictionSource, type DepictionStatus, type LayerName, type SceneSvgProps } from '@/render/svg';
import { buildDemoDocument } from './demo';
import { contextOf, requestOf } from './graph-state';
import { edge, node, nobodyPorts, pipe, portsOf, projectionOf } from './scene-kit';

const parsed = documentToState(buildDemoDocument());
if (!parsed.ok) throw new Error('the demo does not parse');
export const DEMO = parsed.state;

const expandAll = (projection: Projection): ProjectionRequest['expansion'] => ({
  expanded: [...projection.nodes.filter((n) => n.role === 'anchor' || n.role === 'unclassified').map((n) => n.id), UNCLASSIFIED_HUB_ID].map((nodeId) => ({ nodeId, direction: 'both' as const })),
  collapsedEdgeIds: [],
});

/** The demo navigator: the hub overview (`expanded: false`) or every hub expanded (members, overflow, structural edges). */
export function demoNavigatorScene(expanded: boolean, depictions = false): Scene {
  const ctx = contextOf(DEMO);
  const plain = navigatorProjection.build(ctx, requestOf('navigator'));
  const projection = expanded ? navigatorProjection.build(ctx, requestOf('navigator', { expansion: expandAll(plain) })) : plain;
  return pipe(projection, portsOf(DEMO, depictions)).scene;
}

/** A Scene of the given nodes and edges, through the real builders (no ports: names are the IDs). */
export function sceneOf(nodes: readonly GraphNode[], edges: readonly GraphEdge[] = []): Scene {
  return pipe(projectionOf({ nodes, edges }), nobodyPorts).scene;
}
export { edge, node };

/** A hand-written Scene node or edge on top of a built one (a field the builders cannot produce, e.g. a hostile label). */
export const withNode = (scene: Scene, id: string, change: Partial<SceneNode>): Scene => ({ ...scene, nodes: scene.nodes.map((n) => (n.id === id ? { ...n, ...change } : n)) });
export const withEdge = (scene: Scene, id: string, change: Partial<SceneEdge>): Scene => ({ ...scene, edges: scene.edges.map((e) => (e.id === id ? { ...e, ...change } : e)) });

export interface StubSource extends DepictionSource {
  readonly set: (key: string, status: DepictionStatus) => void;
  readonly requested: string[];
}

const IDLE: DepictionStatus = { state: 'idle' };

/** A depiction source with statuses set by the test; an unknown key answers the SAME idle object (a snapshot must be cached); `request` is recorded. */
export function stubSource(initial: Readonly<Record<string, DepictionStatus>> = {}): StubSource {
  const statuses = new Map<string, DepictionStatus>(Object.entries(initial));
  const listeners = new Map<string, Set<() => void>>();
  const requested: string[] = [];
  return {
    requested,
    request: (key) => {
      requested.push(key);
    },
    snapshot: (key) => statuses.get(key) ?? IDLE,
    subscribe: (key, listener) => {
      const set = listeners.get(key) ?? new Set<() => void>();
      set.add(listener);
      listeners.set(key, set);
      return () => set.delete(listener);
    },
    set: (key, status) => {
      statuses.set(key, status);
      for (const listener of listeners.get(key) ?? []) listener();
    },
  };
}

export interface Rendered {
  readonly container: HTMLElement;
  readonly svg: SVGSVGElement;
  readonly commits: ReturnType<typeof vi.fn<(layer: LayerName) => void>>;
  readonly rerender: (change: Partial<SceneSvgProps>) => void;
  /** Layers committed since the last call (and forgets them). */
  readonly drain: () => LayerName[];
}

export function draw(scene: Scene, props: Partial<SceneSvgProps> = {}): Rendered {
  const commits = vi.fn<(layer: LayerName) => void>();
  const base: SceneSvgProps = { scene, lod: 3 as LodLevel, selectedIds: new Set<string>(), ariaLabel: 'Test drawing', onLayerCommit: commits, ...props };
  const view = render(<SceneSvg {...base} />);
  const current = { ...base };
  return {
    container: view.container,
    svg: view.container.querySelector('svg') as SVGSVGElement,
    commits,
    rerender: (change) => {
      Object.assign(current, change);
      view.rerender(<SceneSvg {...current} />);
    },
    drain: () => {
      const layers = commits.mock.calls.map((call) => call[0]);
      commits.mockClear();
      return layers;
    },
  };
}
