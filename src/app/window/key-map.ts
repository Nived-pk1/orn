/**
 * The window's keys (step 8.4g Part B, G5): ONE table. The handlers (the palette, undo and redo here; the star and the shortcuts sheet in `key-map-late.ts`) match an
 * event THROUGH it, and the shortcuts sheet is made from it, together with the map's own key function and the lists' own key table.
 * Only the table and the lookup are in the entry; the words and keys the sheet shows are in `key-words.ts` (a lazy chunk), typed so a binding
 * cannot be added without being listed.
 */
export interface KeyEventLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}
/** The keys the entry itself uses; the star and the "?" are in `key-map-late.ts`, read only by the late chunk. */
export type EntryBindingId = 'palette' | 'undo' | 'redo';

export interface Binding<Id extends string = EntryBindingId> {
  readonly id: Id;
  match(event: KeyEventLike): boolean;
}

export const mod = (e: KeyEventLike): boolean => (e.ctrlKey || e.metaKey) && !e.altKey;
export const plain = (e: KeyEventLike): boolean => !e.ctrlKey && !e.metaKey && !e.altKey;

export const BINDINGS: readonly Binding[] = [
  { id: 'palette', match: (e) => mod(e) && !e.shiftKey && e.key.toLowerCase() === 'k' },
  { id: 'undo', match: (e) => mod(e) && !e.shiftKey && e.key.toLowerCase() === 'z' },
  { id: 'redo', match: (e) => mod(e) && ((e.shiftKey && e.key.toLowerCase() === 'z') || e.key.toLowerCase() === 'y') },
];

/** The id is typed, so the binding is always there. */
export const bindingFor = (id: EntryBindingId): Binding => BINDINGS.find((binding) => binding.id === id) as Binding;
