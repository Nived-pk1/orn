/**
 * The unanchored reactions as a list (step 5.5d, item f; ADV-014 UI part): every id of the projection's `unanchoredReactionIds`, none
 * left out, by name (folded) and then ID, for display only. A reaction without a name is listed by its ID.
 */
import { fold } from '@/core/text';

export interface UnanchoredItem {
  readonly id: string;
  readonly name: string;
}

export function unanchoredItems(ids: readonly string[], nameOf: (id: string) => string | undefined): UnanchoredItem[] {
  return ids
    .map((id) => {
      const name = nameOf(id);
      return { id, name: name === undefined || name.trim() === '' ? id : name };
    })
    .sort((a, b) => {
      const x = fold(a.name);
      const y = fold(b.name);
      return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}
