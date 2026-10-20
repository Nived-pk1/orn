/**
 * The palette's editing commands (ADR-040, studio step E1): "Edit the selected record" and the five "New ..." commands. Studio only: in
 * Study `editorCommandDeps` answers an empty object, so the palette lists none of them (they are optional deps), and `window.tsx` does
 * not even call it there (the literal folds the call away with this module and `@/core/editing`).
 */
import type { CanonicalState } from '@/core/schema';
import { hasNames } from '@/core/editing';
import { currentOf } from '@/ui/state';
import { EDITING } from '@/app/edition';
import type { EditorsApi } from './drafts-ui';
import type { CommandDeps } from './palette-commands';

function editNamesCommand(editors: EditorsApi | null, state: CanonicalState, inspector: Parameters<typeof currentOf>[0]): CommandDeps['editNames'] {
  const ref = currentOf(inspector);
  const record = ref === null ? undefined : (state.records[ref.kind] as Readonly<Record<string, { readonly kind: string }>>)[ref.id];
  const reason =
    editors === null ? 'editing is not available here' : editors.editReason ?? (ref === null || record === undefined || !(hasNames(record) || editors.fullEditorKinds?.includes(record.kind) === true) ? 'show a species, class, reagent, reaction or mechanism in the inspector first: only these can be edited here' : undefined);
  return { reason, run: () => (ref === null || editors === null ? undefined : editors.editNames(ref)) };
}


const unavailable = (editors: EditorsApi | null): string | undefined => (editors === null ? 'editing is not available here' : editors.editReason);

type EditorDeps = Pick<CommandDeps, 'editNames' | 'newSpecies' | 'newClass' | 'newReagent' | 'newReaction' | 'newMechanism'>;

export function editorCommandDeps(editors: EditorsApi | null, state: CanonicalState, inspector: Parameters<typeof currentOf>[0]): EditorDeps {
  if (!EDITING) return {};
  const reason = unavailable(editors);
  return {
    editNames: editNamesCommand(editors, state, inspector),
    newSpecies: { reason, run: () => editors?.newSpecies() },
    newClass: { reason, run: () => editors?.newClass() },
    newReagent: { reason, run: () => editors?.newReagent() },
    newReaction: { reason, run: () => editors?.newReaction() },
    newMechanism: { reason, run: () => editors?.newMechanism() },
  };
}
