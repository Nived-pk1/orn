/**
 * The navigator's structures (step 5.5a part 2, item i): the shared depiction binding (`src/render/svg`) at the structure-area size.
 * A node's depiction key is the service's own request key, so it is known before any answer; the lookup is bounded; object URLs are
 * made and revoked through the port, never here (details in the binding).
 */
import { STRUCTURE_AREA } from '@/render/scene';
import { createDepictionBinding as bind, MAX_DEPICTION_LOOKUP, type DepictionBinding } from '@/render/svg';
import type { NavigatorDepictions, NavigatorPorts } from './contracts';

export { MAX_DEPICTION_LOOKUP };
export type { DepictionBinding };

export const createDepictionBinding = (port: NavigatorDepictions, timers: NavigatorPorts['timers']): DepictionBinding => bind(port, timers, STRUCTURE_AREA);

const bindings = new WeakMap<NavigatorPorts, DepictionBinding | null>();

/** The binding of a set of ports, made once and kept for as long as the ports live (the manager's LRU bounds what it holds). */
export function depictionBindingOf(ports: NavigatorPorts): DepictionBinding | undefined {
  const known = bindings.get(ports);
  if (known !== undefined) return known ?? undefined;
  const made = ports.depictions === undefined ? null : createDepictionBinding(ports.depictions, ports.timers);
  bindings.set(ports, made);
  return made ?? undefined;
}
