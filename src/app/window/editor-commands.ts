/**
 * The palette's editing commands (ADR-040, studio step E1): "Edit the selected record" and the "New ..." commands (one per entry of the lazy entries table). Studio only: in
 * Study `editorCommandDeps` answers an empty object, so the palette lists none of them (they are optional deps), and `window.tsx` does
 * not even call it there (the literal folds the call away with this module and `@/core/editing`).
 */
import type { CanonicalState } from '@/core/schema';
import { currentOf } from '@/ui/state';
import { EDITING } from '@/app/edition';
import type { EditorsApi } from './drafts-ui';
import type { CommandDeps } from './palette-commands';

function editNamesCommand(editors: EditorsApi | null, state: CanonicalState, inspector: Parameters<typeof currentOf>[0]): CommandDeps['editNames'] {
  const ref = currentOf(inspector);
  const record = ref === null ? undefined : (state.records[ref.kind] as Readonly<Record<string, { readonly kind: string }>>)[ref.id];
  const reason =
    editors === null ? 'editing is not available here' : editors.editReason ?? (ref === null || record === undefined || !(editors.namesKinds?.includes(record.kind) === true || editors.fullEditorKinds?.includes(record.kind) === true) ? 'show a species, class, reagent, reaction or mechanism in the inspector first: only these can be edited here' : undefined);
  return { reason, run: () => (ref === null || editors === null ? undefined : editors.editNames(ref)) };
}


const unavailable = (editors: EditorsApi | null): string | undefined => (editors === null ? 'editing is not available here' : editors.editReason);

type EditorDeps = Pick<CommandDeps, 'editNames' | 'newKinds'>;

export function editorCommandDeps(editors: EditorsApi | null, state: CanonicalState, inspector: Parameters<typeof currentOf>[0]): EditorDeps {
  if (!EDITING) return {};
  const reason = unavailable(editors);
  return {
    editNames: editNamesCommand(editors, state, inspector),
    // one command per entry in the lazy table: none until it has loaded (after the first paint)
    newKinds: (editors?.entries ?? []).map((entry) => ({ id: entry.paletteId, title: entry.title, keywords: entry.keywords, reason, run: () => editors?.startNew(entry.kind, {}) })),
  };
}
