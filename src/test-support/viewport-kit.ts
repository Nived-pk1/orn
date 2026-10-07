/** Test kit for the viewport (step 5.4b): synthetic Scenes of any size from a seeded generator, and manual frame and timer clocks. */
import type { Scene, SceneEdge, SceneNode } from '@/render/scene';
import type { Size } from '@/render/viewport';

/** A small deterministic generator (mulberry32): the same seed always draws the same Scene. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function syntheticScene(nodeCount: number, edgeCount: number, seed = 1, extent = 8000): Scene {
  const random = seeded(seed);
  const nodes: SceneNode[] = Array.from({ length: nodeCount }, (_, i) => ({
    id: `n${i}`,
    glyph: 'species',
    box: 'species',
    x: Math.floor(random() * extent),
    y: Math.floor(random() * extent),
    width: 120 + Math.floor(random() * 80),
    height: 40 + Math.floor(random() * 40),
    label: [{ text: `N${i}` }],
    depictionKey: `d${i}`,
    badges: [],
    emphasis: 'normal',
    state: { dimmed: false, onPath: false },
    minLod: 0,
    ariaLabel: `Node ${i}`,
  }));
  const edges: SceneEdge[] = Array.from({ length: edgeCount }, (_, i) => {
    const from = nodes[Math.floor(random() * nodeCount)] as SceneNode;
    const to = nodes[Math.floor(random() * nodeCount)] as SceneNode;
    const a = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const b = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
    return {
      id: `e${i}`,
      from: from.id,
      to: to.id,
      points: [a, b],
      semantic: 'transforms_to',
      stroke: 'solid',
      weight: 'normal',
      arrowHead: 'filled',
      labelAt: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      minLod: 0,
      ariaLabel: `Edge ${i}`,
    };
  });
  return { revision: 1, projectionKey: `p${seed}`, layoutKey: `l${seed}`, nodes, edges, bounds: { width: extent + 200, height: extent + 80 }, truncation: null };
}

/** A frame clock run by hand: `run()` fires what was scheduled, once. */
export function manualFrames() {
  let next: (() => void) | undefined;
  return {
    schedule: (callback: () => void): number => {
      next = callback;
      return 1;
    },
    cancel: (): void => {
      next = undefined;
    },
    pending: (): boolean => next !== undefined,
    run: (): void => {
      const callback = next;
      next = undefined;
      callback?.();
    },
  };
}

/** A timer clock run by hand: `advance(ms)` fires what is due, in order. */
export function manualTimers() {
  let now = 0;
  let id = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    setTimer: (callback: () => void, ms: number): number => {
      id += 1;
      timers.set(id, { at: now + ms, callback });
      return id;
    },
    clearTimer: (handle: unknown): void => void timers.delete(handle as number),
    count: (): number => timers.size,
    advance(ms: number): void {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (due === undefined) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].callback();
      }
      now = target;
    },
  };
}

export const SCREEN: Size = { width: 1200, height: 800 };
