/**
 * The navigator's structures (step 5.5a part 2, item i): the depiction manager of `src/render/svg` wired to the depiction service
 * through the port. A node's depiction key is the service's own request key (a hash of format, value and size), so it is known
 * before any answer; the key-to-structure lookup that lets the manager's fetch find the structure is BOUNDED (`MAX_DEPICTION_LOOKUP`,
 * refreshed on every use, the oldest dropped). Object URLs are made and revoked through the port, never here.
 * Answers of the service: `queue_full` and `cancelled` are the manager's BUSY answer (not cached; the viewport queue asks again a
 * bounded number of times); `timeout`, `invalid`, `refused`, `bad_options` and `unavailable` are `unavailable` and cached by the
 * manager (a timeout is NOT retried: a hung structure must not restart the chem worker again and again).
 */
import type { StructureRep } from '@/core/schema';
import { STRUCTURE_AREA } from '@/render/scene';
import { createDepictionManager, DEPICTION_BUSY, type DepictionAnswer, type DepictionManager } from '@/render/svg';
import type { NavigatorDepictions, NavigatorPorts } from './contracts';

/** Keys the lookup holds: a drawing has at most 400 nodes, so this is room for several drawings. */
export const MAX_DEPICTION_LOOKUP = 2_000;

export interface DepictionBinding {
  /** The key of a structure at the structure-area size; remembers it for the fetch. */
  readonly keyOf: (structure: StructureRep) => string;
  readonly manager: DepictionManager;
  /** Keys the lookup holds now. */
  readonly lookupSize: () => number;
}

const BUSY_REASONS: ReadonlySet<string> = new Set(['queue_full', 'cancelled']);

export function createDepictionBinding(port: NavigatorDepictions, timers: NavigatorPorts['timers']): DepictionBinding {
  const lookup = new Map<string, StructureRep>();
  const remember = (key: string, structure: StructureRep): void => {
    lookup.delete(key);
    lookup.set(key, structure);
    while (lookup.size > MAX_DEPICTION_LOOKUP) lookup.delete(lookup.keys().next().value as string);
  };
  const fetchSvg = async (key: string): Promise<DepictionAnswer> => {
    const structure = lookup.get(key);
    // A key that left the lookup is not in the drawing any more: not an answer about the structure, so not cached.
    if (structure === undefined) return { ok: false, reason: DEPICTION_BUSY };
    const answer = await port.depict(structure, STRUCTURE_AREA);
    if (answer.ok) return { ok: true, svg: answer.svg };
    return { ok: false, reason: BUSY_REASONS.has(answer.reason) ? DEPICTION_BUSY : answer.reason };
  };
  const manager = createDepictionManager({
    fetchSvg,
    createUrl: (svg) => port.createUrl(svg),
    revokeUrl: (url) => port.revokeUrl(url),
    setTimer: (callback, ms) => timers.after(ms, callback),
    clearTimer: (handle) => (handle as () => void)(),
  });
  const cancel = manager.cancel;
  return {
    keyOf(structure) {
      const key = port.keyOf(structure, STRUCTURE_AREA);
      remember(key, structure);
      return key;
    },
    manager: { ...manager, cancel: (key) => (cancel(key), port.cancel(key)) },
    lookupSize: () => lookup.size,
  };
}

const bindings = new WeakMap<NavigatorPorts, DepictionBinding | null>();

/** The binding of a set of ports, made once and kept for as long as the ports live (the manager's LRU bounds what it holds). */
export function depictionBindingOf(ports: NavigatorPorts): DepictionBinding | undefined {
  const known = bindings.get(ports);
  if (known !== undefined) return known ?? undefined;
  const made = ports.depictions === undefined ? null : createDepictionBinding(ports.depictions, ports.timers);
  bindings.set(ports, made);
  return made ?? undefined;
}
