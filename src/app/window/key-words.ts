/**
 * The words of the window's keys (step 8.4g Part B, G5), for the shortcuts sheet only (a lazy chunk, so the entry carries none of it). Typed by
 * `BindingId`, so a binding in `key-map.ts` cannot be added without its words; the sheet is still made from the real tables (the map's key
 * function and the lists' key table are read, not copied).
 */
import { canvasShortcuts } from '@/features/navigator';
import { listShortcuts } from '@/ui/primitives';
import { BINDINGS, type EntryBindingId } from './key-map';
import { LATE_BINDINGS, type LateBindingId } from './key-map-late';

export type BindingId = EntryBindingId | LateBindingId;

export interface BindingWords {
  readonly group: 'Anywhere' | 'Studio';
  readonly label: string;
  /** As the sheet shows them. */
  readonly keys: readonly string[];
}

export const BINDING_WORDS: Readonly<Record<BindingId, BindingWords>> = {
  palette: { group: 'Anywhere', label: 'Search records and commands', keys: ['Ctrl+K', '⌘K'] },
  star: { group: 'Anywhere', label: 'Star the selected record for revision (again to remove)', keys: ['S'] },
  shortcuts: { group: 'Anywhere', label: 'Show this list of keys', keys: ['?'] },
  undo: { group: 'Studio', label: 'Undo the last change', keys: ['Ctrl+Z', '⌘Z'] },
  redo: { group: 'Studio', label: 'Redo the change', keys: ['Ctrl+Shift+Z', 'Ctrl+Y', '⌘⇧Z'] },
};

export interface ShortcutGroup {
  readonly title: string;
  readonly entries: readonly { readonly label: string; readonly keys: readonly string[] }[];
}

/** The groups of the shortcuts sheet; the Studio group is for an author edition only. */
export function shortcutGroups(studio: boolean): readonly ShortcutGroup[] {
  const of = (group: BindingWords['group']) => [...BINDINGS, ...LATE_BINDINGS].map((binding) => BINDING_WORDS[binding.id]).filter((words) => words.group === group).map(({ label, keys }) => ({ label, keys }));
  return [
    { title: 'Anywhere', entries: of('Anywhere') },
    { title: 'Map', entries: canvasShortcuts() },
    { title: 'Lists', entries: listShortcuts() },
    ...(studio ? [{ title: 'Studio', entries: of('Studio') }] : []),
  ];
}
