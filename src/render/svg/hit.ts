/**
 * Hit resolution for the ONE delegated listener on the root `<svg>` (step 5.5a): the node or edge group under the event target.
 * Labels, badges and the overlay do not take pointer events (CSS), so a click on a label text reaches the node or edge below it.
 */
import type { SceneHit } from './contracts';

export function hitOf(target: EventTarget | null): SceneHit | null {
  if (target === null || typeof (target as Element).closest !== 'function') return null;
  const element = (target as Element).closest('[data-node-id], [data-edge-id]');
  if (element === null) return null;
  const node = element.getAttribute('data-node-id');
  if (node !== null) return { kind: 'node', id: node };
  const edge = element.getAttribute('data-edge-id');
  return edge === null ? null : { kind: 'edge', id: edge };
}
