/**
 * Test kit for the navigator (step 5.5a): a fake layout service over the pure fallback layout (it counts its calls and can be held
 * back, so a test can supersede a request), a fake measurer that is ready at once, manual timers, and the ports over a store.
 * Test code only. The fakes are what jsdom and Node can do: no worker, no canvas, no fonts (the browser parts are proved by the e2e).
 */
import type { StoreHandle } from '@/core/commands';
import { createDerivedIndexes } from '@/app/services/derived-indexes';
import { layoutFallback } from '@/layout';
import type { LayoutRequest } from '@/layout/contracts';
import type { NavigatorDepictions, NavigatorPorts } from '@/features/navigator';
import { createNavigatorUi, type NavigatorUi, type NavigatorUiPort, type NavigatorUiStores } from '@/ui/state';
import type { LayoutOutcome, LayoutService } from '@/workers/layout';
import { fakeMeasurer } from './scene-kit';

export interface FakeLayout extends Pick<LayoutService, 'layout'> {
  /** Requests received, in order. */
  readonly requests: LayoutRequest[];
  /** While set, an answer waits for it (a test releases it to finish a layout later). */
  hold: Promise<void> | undefined;
  /** While set, the next answers are this failure. */
  failure: Extract<LayoutOutcome, { ok: false }> | undefined;
}

export function fakeLayout(): FakeLayout {
  const fake: FakeLayout = {
    requests: [],
    hold: undefined,
    failure: undefined,
    async layout(_view, request) {
      fake.requests.push(request);
      const held = fake.hold;
      if (held !== undefined) await held;
      if (fake.failure !== undefined) return fake.failure;
      return { ok: true, result: layoutFallback(request, 'engine_unavailable', () => 0), cached: false };
    },
  };
  return fake;
}

export interface ManualTimers {
  after(ms: number, run: () => void): () => void;
  /** Runs every timer due within `ms` of fake time, in order. */
  advance(ms: number): void;
  pending(): number;
}

export function manualTimers(): ManualTimers {
  let now = 0;
  let next = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  return {
    after(ms, run) {
      const id = (next += 1);
      timers.set(id, { at: now + ms, run });
      return () => void timers.delete(id);
    },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (due === undefined) break;
        timers.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].run();
      }
      now = until;
    },
    pending: () => timers.size,
  };
}

/** A depiction port that answers a tiny SVG at once and records what was asked for and what was cancelled (step 5.5b). */
export interface FakeDepictions extends NavigatorDepictions {
  readonly asked: string[];
  readonly cancelled: string[];
  readonly urls: string[];
  /** Keys answered with a failure (`unavailable`) instead of an SVG. */
  readonly failing: Set<string>;
}

export function fakeDepictions(): FakeDepictions {
  const asked: string[] = [];
  const cancelled: string[] = [];
  const urls: string[] = [];
  const failing = new Set<string>();
  const keyOf: NavigatorDepictions['keyOf'] = (structure, size) => `${structure.format}:${structure.value}@${size.width}x${size.height}`;
  return {
    asked,
    cancelled,
    urls,
    failing,
    keyOf,
    depict: (structure, size) => {
      const key = keyOf(structure, size);
      asked.push(key);
      return Promise.resolve(failing.has(key) ? { ok: false, reason: 'unavailable', message: 'no structure' } : { ok: true, svg: '<svg xmlns="http://www.w3.org/2000/svg"/>' });
    },
    cancel: (key) => void cancelled.push(key),
    createUrl: () => {
      const url = `blob:fake-${urls.length}`;
      urls.push(url);
      return url;
    },
    revokeUrl: () => undefined,
  };
}

export interface NavigatorRig {
  readonly ports: NavigatorPorts;
  readonly layout: FakeLayout;
  readonly timers: ManualTimers;
  readonly ui: NavigatorUiStores;
  /** The persistence wrapper of the UI stores (saves go to `uiSaves`). */
  readonly uiPersistence: NavigatorUi;
  /** The values written through the UI port, in order. */
  readonly uiSaves: Readonly<Record<string, unknown>>[];
  readonly logs: { type: string; message: string }[];
  /** How many times `indexes.current()` was asked for. */
  readonly indexAsks: () => number;
  /** The depiction port, when the rig was made with `depictions: true`. */
  readonly depictions: FakeDepictions | undefined;
}

/** Ports over a real store, with the fakes above; the indexes are the app's own `DerivedIndexes` service over that store. */
export function navigatorRig(store: StoreHandle, options: { measurerReady?: Promise<void>; uiPort?: Partial<NavigatorUiPort>; depictions?: boolean } = {}): NavigatorRig {
  const derived = createDerivedIndexes({ store, clock: { nowMs: () => 0 } });
  const layout = fakeLayout();
  const timers = manualTimers();
  const logs: { type: string; message: string }[] = [];
  const log = (type: string, message: string): void => void logs.push({ type, message });
  const uiSaves: Record<string, unknown>[] = [];
  const uiPersistence = createNavigatorUi(
    { stored: undefined, mode: () => 'writable', save: (value) => (uiSaves.push({ ...value }), Promise.resolve()), ...options.uiPort },
    timers,
    log,
  );
  const ui = uiPersistence.stores;
  let asks = 0;
  const depictions = options.depictions === true ? fakeDepictions() : undefined;
  const ports: NavigatorPorts = {
    store,
    indexes: { current: () => ((asks += 1), derived.current()) },
    layout,
    measurer: { measure: fakeMeasurer, ready: () => options.measurerReady ?? Promise.resolve() },
    timers,
    ui,
    uiStatus: uiPersistence.status,
    log,
    ...(depictions === undefined ? {} : { depictions }),
  };
  return { ports, layout, timers, ui, uiPersistence, uiSaves, logs, indexAsks: () => asks, depictions };
}
