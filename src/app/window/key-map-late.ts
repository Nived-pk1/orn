/** The window's keys that only the late chunk reads (step 8.4g Part B, size trim): the star and the question mark. Same shape as `key-map.ts`. */
import { plain, type Binding } from './key-map';

export type LateBindingId = 'star' | 'shortcuts';

export const LATE_BINDINGS: readonly Binding<LateBindingId>[] = [
  { id: 'star', match: (e) => plain(e) && e.key.toLowerCase() === 's' },
  { id: 'shortcuts', match: (e) => plain(e) && e.key === '?' },
];

export function lateBindingFor(id: LateBindingId): Binding<LateBindingId> {
  const found = LATE_BINDINGS.find((binding) => binding.id === id);
  if (found === undefined) throw new Error(`no key binding ${id}`);
  return found;
}
