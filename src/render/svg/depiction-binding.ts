/**
 * (Moved from the navigator in step 5.6a so that the inspector shares it; the navigator's `depictions.ts` binds it to its area.)
 * Structures (step 5.5a part 2, item i): the depiction manager of `src/render/svg` wired to the depiction service
 * through the port. A node's depiction key is the service's own request key (a hash of format, value and size), so it is known
 * before any answer; the key-to-structure lookup that lets the manager's fetch find the structure is BOUNDED (`MAX_DEPICTION_LOOKUP`,
 * refreshed on every use, the oldest dropped). Object URLs are made and revoked through the port, never here.
 * Answers of the service: `queue_full` and `cancelled` are the manager's BUSY answer (not cached; the viewport queue asks again a
 * bounded number of times); `timeout`, `invalid`, `refused`, `bad_options` and `unavailable` are `unavailable` and cached by the
 * manager (a timeout is NOT retried: a hung structure must not restart the chem worker again and again). After the engine has been retried
 * successfully (`port.recovered`, step 5.5d) the manager forgets the unavailable keys, so they are asked for again when next shown.
 * A failure while the engine is still loading (`port.enginePending`) is kept as `not_ready`; when the engine is ready (`port.engineReady`,
 * listened to only after a request was made while it was loading) the manager forgets just those keys, so the cards that show them ask
 * again (phone mode B, part 1: a slow phone opens a page before the wasm has arrived).
 */
import type { StructureMode } from '@/chem/contracts';
import type { StructureRep } from '@/core/schema';
import { createDepictionManager, DEPICTION_BUSY, type DepictionAnswer, type DepictionManager } from './depictions';
import type { DepictionTimers } from './use-depiction-retry';

type Area = { readonly width: number; readonly height: number };

/** What the binding needs from the depiction service (the navigator's and the inspector's ports have exactly this). */
export interface DepictionPort {
  keyOf(structure: StructureRep, size: Area, mode?: StructureMode): string;
  depict(structure: StructureRep, size: Area, mode?: StructureMode): Promise<{ readonly ok: true; readonly svg: string } | { readonly ok: false; readonly reason: string; readonly message: string }>;
  cancel(key: string): void;
  /** How structures are drawn now (equation step, part 4). Absent: Skeletal. A key is made in THIS mode and its fetch draws in the same one. */
  mode?(): StructureMode;
  /** Calls the listener when the mode changes; answers the unsubscribe. */
  onMode?(listener: () => void): () => void;
  recovered?(listener: () => void): () => void;
  /** True while the chem engine is still loading (not ready, not failed). Absent: never. */
  enginePending?(): boolean;
  /** Calls the listener each time the chem engine becomes ready; answers the unsubscribe. */
  engineReady?(listener: () => void): () => void;
  createUrl(svg: string): string;
  revokeUrl(url: string): void;
}

/** Keys the lookup holds: a drawing has at most 400 nodes, so this is room for several drawings. */
export const MAX_DEPICTION_LOOKUP = 2_000;

export interface DepictionBinding {
  /** The key of a structure at the binding's area size; remembers it for the fetch. */
  readonly keyOf: (structure: StructureRep) => string;
  readonly manager: DepictionManager;
  /** Keys the lookup holds now. */
  readonly lookupSize: () => number;
}

const BUSY_REASONS: ReadonlySet<string> = new Set(['queue_full', 'cancelled']);

export function createDepictionBinding(port: DepictionPort, timers: DepictionTimers, area: Area): DepictionBinding {
  // the mode is kept with the structure: the key says which mode it was made in, and the fetch must draw in that one
  const lookup = new Map<string, { readonly structure: StructureRep; readonly mode: StructureMode }>();
  const remember = (key: string, structure: StructureRep, mode: StructureMode): void => {
    lookup.delete(key);
    lookup.set(key, { structure, mode });
    while (lookup.size > MAX_DEPICTION_LOOKUP) lookup.delete(lookup.keys().next().value as string);
  };
  // Listening for "the engine is ready" costs a subscription, so it is made only while a request was asked before the engine was ready, and
  // dropped when it fires (a binding that never asked early listens to nothing).
  let stopListening: (() => void) | undefined;
  const listenForReady = (): void => {
    if (stopListening !== undefined || port.engineReady === undefined) return;
    stopListening = port.engineReady(() => {
      stopListening?.();
      stopListening = undefined;
      manager.forgetNotReady();
    });
  };
  const fetchSvg = async (key: string): Promise<DepictionAnswer> => {
    if (port.enginePending?.() === true) listenForReady();
    const known = lookup.get(key);
    // A key that left the lookup is not in the drawing any more: not an answer about the structure, so not cached.
    if (known === undefined) return { ok: false, reason: DEPICTION_BUSY };
    const answer = await port.depict(known.structure, area, known.mode);
    if (answer.ok) return { ok: true, svg: answer.svg };
    return { ok: false, reason: BUSY_REASONS.has(answer.reason) ? DEPICTION_BUSY : answer.reason };
  };
  const manager = createDepictionManager({
    fetchSvg,
    createUrl: (svg) => port.createUrl(svg),
    revokeUrl: (url) => port.revokeUrl(url),
    setTimer: (callback, ms) => timers.after(ms, callback),
    clearTimer: (handle) => (handle as () => void)(),
    isPending: () => port.enginePending?.() === true,
  });
  const cancel = manager.cancel;
  // after a successful retry of the chemistry engine every structure that was unavailable is asked for again when it is next shown
  port.recovered?.(() => manager.forgetUnavailable());
  return {
    keyOf(structure) {
      const mode = port.mode?.() ?? 'skeletal';
      const key = port.keyOf(structure, area, mode);
      remember(key, structure, mode);
      return key;
    },
    manager: { ...manager, cancel: (key) => (cancel(key), port.cancel(key)) },
    lookupSize: () => lookup.size,
  };
}
