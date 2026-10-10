/**
 * The navigator pipeline (step 5.5a, items d and e): projection -> node sizes -> layout request -> layout service -> Scene. A plain
 * model with no React and no DOM; the screen subscribes to its state. Rules:
 *  - The projection is rebuilt only when a ChangeSet touches a kind in `PROJECTION_KINDS` (always on replace and remote), or the
 *    filters or the exam version change; the PREVIOUS Projection object is kept when `sameProjection` holds.
 *  - A ChangeSet touching a kind in `SCENE_KINDS` (what the Scene ports read) recomputes sizes and the layout request; an unchanged
 *    request reuses the last layout result; the Scene is rebuilt. A ChangeSet touching neither rebuilds nothing.
 *  - Memos key on object identity; no content hash. A superseded run is never shown (a token, and the service cancels the call).
 *  - A failure value is an error state with its code. While a new layout is computed the previous Scene stays on screen; the skeleton
 *    shows only when there is no Scene yet and `SKELETON_DELAY_MS` have passed.
 *  - The overview does not expand (ADR-037, step 5.5b): the request always carries no expansion, whatever the expansion store holds
 *    (the store stays for later views). A selection that is not in a new Scene is cleared (and logged).
 * An indexes handle is asked for at every build and never kept.
 */
import { DEFAULT_TRAVERSAL_LIMITS, createScopeOf, navigatorProjection, sameProjection } from '@/core/graph';
import type { Projection, ProjectionRequest } from '@/core/graph';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { LayoutAlgorithm, LayoutRequest, LayoutResult, Point } from '@/layout/contracts';
import { buildLayoutRequest, buildScene, labelSizes, nodeSizes } from '@/render/scene';
import type { LabelSizes, NodeSizes, Scene } from '@/render/scene';
import type { NavigatorError, NavigatorPorts } from './contracts';
import { depictionBindingOf } from './depictions';
import { NAVIGATOR_MAX_EDGES, NAVIGATOR_MAX_NODES } from './limits';
import { touchOf } from './reads';
import { sameRequest } from './same-request';
import { createScenePorts } from './scene-ports';

export const SKELETON_DELAY_MS = 300;
/** The service's view key: one navigator drawing, so a newer request replaces the older one. */
export const LAYOUT_VIEW = 'navigator';
export { NAVIGATOR_MAX_EDGES, NAVIGATOR_MAX_NODES } from './limits';

export interface NavigatorState {
  readonly scene: Scene | null;
  readonly error: NavigatorError | null;
  /** True when there is no Scene yet and `SKELETON_DELAY_MS` have passed. */
  readonly skeleton: boolean;
  /** A new Scene is being computed (the previous one, if any, stays on screen). */
  readonly working: boolean;
  /** The admitted hubs (real hubs and Unclassified) of the current projection, sorted. */
  readonly hubIds: readonly string[];
  /** Which layout drew the current Scene (step 5.5c): `grid` for an arranged overview, `elk` or `fallback` otherwise; null before the first Scene. */
  readonly layout: LayoutResult['engine'] | null;
  /** The reactions no family holds (the projection's `unanchoredReactionIds`, sorted: step 5.5d, item f). All of them are here, none cut. */
  readonly unanchored: readonly string[];
  /** How many reactions the dataset holds (the empty states, step 5.5d item j). */
  readonly reactions: number;
}

export interface PipelineStats {
  readonly projections: number;
  readonly sizes: number;
  readonly requests: number;
  readonly layoutCalls: number;
  readonly scenes: number;
}

export interface NavigatorModel {
  getState(): NavigatorState;
  subscribe(listener: () => void): () => void;
  /** Subscribes to the inputs and runs the first build once the measurer is ready. Safe to call again after `stop`. */
  start(): void;
  stop(): void;
  stats(): PipelineStats;
}

const hubIdsOf = (projection: Projection): string[] => projection.nodes.filter((node) => node.role === 'anchor' || node.role === 'unclassified').map((node) => node.id);

const NO_EXPANSION: ProjectionRequest['expansion'] = { expanded: [], collapsedEdgeIds: [] };

const INITIAL: NavigatorState = { scene: null, error: null, skeleton: false, working: false, hubIds: [], layout: null, unanchored: [], reactions: 0 };

/** `layoutAlgorithm` forces the layout of the overview (the tests that are about the layered path use it); the app leaves it unset. */
export interface NavigatorModelOptions {
  readonly layoutAlgorithm?: LayoutAlgorithm;
}

export function createNavigatorModel(ports: NavigatorPorts, modelOptions: NavigatorModelOptions = {}): NavigatorModel {
  const binding = depictionBindingOf(ports);
  let state = INITIAL;
  const listeners = new Set<() => void>();
  let running = false;
  let measured = false;
  let token = 0;
  let scheduled = false;
  let dirtyProjection = true;
  let epoch = 0;
  let projection: Projection | null = null;
  let sizes: { readonly of: Projection; readonly epoch: number; readonly value: NodeSizes; readonly labels: LabelSizes } | null = null;
  let last: { readonly request: LayoutRequest; readonly result: LayoutResult } | null = null;
  let stopTimer: (() => void) | undefined;
  let offs: (() => void)[] = [];
  const counts = { projections: 0, sizes: 0, requests: 0, layoutCalls: 0, scenes: 0 };

  const set = (patch: Partial<NavigatorState>): void => {
    state = { ...state, ...patch };
    for (const listener of [...listeners]) listener();
  };
  const fail = (code: string, message: string): void => {
    set({ error: { code, message }, working: false });
  };

  const requestOf = (): ProjectionRequest => ({
    view: 'navigator',
    focus: [],
    expansion: NO_EXPANSION,
    filters: ports.ui.filters.getState().filters,
    limits: { ...DEFAULT_TRAVERSAL_LIMITS, maxNodes: NAVIGATOR_MAX_NODES, maxEdges: NAVIGATOR_MAX_EDGES },
  });

  function buildOnce(): Projection {
    const exam = ports.ui.exam.getState().active;
    const indexes = ports.indexes.current();
    const scopeOf = exam === null ? () => 'unmapped' as const : createScopeOf(indexes, exam.examId, exam.examVersionId);
    const built = navigatorProjection.build({ state: ports.store.getState(), indexes, scopeOf }, requestOf());
    counts.projections += 1;
    return built;
  }

  function buildProjection(): Projection {
    const built = buildOnce();
    return projection !== null && sameProjection(projection, built) ? projection : built;
  }

  function startSkeletonTimer(): void {
    if (state.scene !== null || stopTimer !== undefined) return;
    stopTimer = ports.timers.after(SKELETON_DELAY_MS, () => {
      stopTimer = undefined;
      if (state.scene === null && state.error === null) set({ skeleton: true });
    });
  }

  async function run(): Promise<void> {
    const mine = ++token;
    const rebuild = dirtyProjection;
    dirtyProjection = false;
    set({ working: true });
    startSkeletonTimer();
    try {
      if (rebuild || projection === null) projection = buildProjection();
      const current = projection;
      const scenePorts = createScenePorts(ports.store.getState(), binding?.keyOf);
      if (sizes === null || sizes.of !== current || sizes.epoch !== epoch) {
        sizes = { of: current, epoch, value: nodeSizes(current, scenePorts, ports.measurer.measure), labels: labelSizes(current, scenePorts, ports.measurer.measure) };
        counts.sizes += 1;
      }
      const previous: Record<string, Point> = last === null ? {} : { ...last.result.positions };
      const built = buildLayoutRequest(current, sizes.value, { previous, labelSizes: sizes.labels, ...(modelOptions.layoutAlgorithm === undefined ? {} : { algorithm: modelOptions.layoutAlgorithm }) });
      counts.requests += 1;
      if (!built.ok) return fail(built.code, built.message);
      let result: LayoutResult;
      if (last !== null && sameRequest(last.request, built.request)) {
        result = last.result;
      } else {
        counts.layoutCalls += 1;
        const outcome = await ports.layout.layout(LAYOUT_VIEW, built.request);
        if (mine !== token) return;
        if (!outcome.ok) {
          if (outcome.code === 'CANCELLED') return;
          return fail(outcome.code, outcome.message);
        }
        result = outcome.result;
        last = { request: built.request, result };
        // (the grid layout takes no previous positions and is already a fixed point: it is asked once)
        if (built.request.previous === undefined && built.request.algorithm !== 'grid') {
          // A layout computed without previous positions differs from one that is given its own result as previous (ELK's interactive
          // crossing minimisation), so the first interaction would move the view. Ask once more with the result as previous and show
          // only that answer (step 5.5a, item b). Bounded: once per request, and the second request has previous positions.
          const again = buildLayoutRequest(current, sizes.value, { previous: result.positions, labelSizes: sizes.labels, ...(modelOptions.layoutAlgorithm === undefined ? {} : { algorithm: modelOptions.layoutAlgorithm }) });
          counts.requests += 1;
          if (!again.ok) return fail(again.code, again.message);
          counts.layoutCalls += 1;
          const second = await ports.layout.layout(LAYOUT_VIEW, again.request);
          if (mine !== token) return;
          if (!second.ok) {
            if (second.code === 'CANCELLED') return;
            return fail(second.code, second.message);
          }
          result = second.result;
          last = { request: again.request, result };
        }
      }
      if (mine !== token) return;
      const scene = buildScene(current, result, { sizes: sizes.value, labelSizes: sizes.labels }, scenePorts);
      counts.scenes += 1;
      if (!scene.ok) return fail(scene.code, scene.message);
      stopTimer?.();
      stopTimer = undefined;
      const hubIds = hubIdsOf(current);
      const selected = ports.ui.selection.getState().selected;
      if (selected !== null && !(selected.kind === 'node' ? scene.scene.nodes.some((n) => n.id === selected.id) : scene.scene.edges.some((e) => e.id === selected.id))) {
        ports.ui.selection.getState().select(null);
        ports.log('selection_cleared', `the selected ${selected.kind} ${selected.id} is not in the drawing any more`);
      }
      set({ scene: scene.scene, error: null, skeleton: false, working: false, hubIds, layout: result.engine, unanchored: current.unanchoredReactionIds, reactions: Object.keys(ports.store.getState().records.reaction).length });
    } catch (error) {
      if (mine !== token) return;
      const message = error instanceof Error ? error.message : String(error);
      ports.log('navigator_failed', message);
      fail('FAILED', message);
    }
  }

  function schedule(): void {
    if (!running || !measured || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (running && measured) void run();
    });
  }

  const onChange = (changes: ChangeSet): void => {
    const touch = touchOf(changes);
    if (touch === 'none') return;
    epoch += 1;
    if (touch === 'projection') dirtyProjection = true;
    schedule();
  };
  const onRequest = (): void => {
    dirtyProjection = true;
    schedule();
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    start() {
      if (running) return;
      running = true;
      offs = [ports.store.subscribe(onChange), ports.ui.filters.subscribe(onRequest), ports.ui.exam.subscribe(onRequest)];
      dirtyProjection = true;
      if (state.scene === null) startSkeletonTimer();
      void ports.measurer.ready().then(() => {
        if (!running) return;
        measured = true;
        schedule();
      });
    },
    stop() {
      running = false;
      measured = false;
      token += 1;
      for (const off of offs) off();
      offs = [];
      stopTimer?.();
      stopTimer = undefined;
    },
    stats: () => ({ ...counts }),
  };
}
