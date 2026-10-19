/** The editor's port filled from the app's session manager and store (ADR-040). Pure wiring; no chemistry. */
import type { RecordRef } from '@/core/schema';
import type { ClassPickerPort, EditorPort, StructurePort } from '@/features/workbench';
import type { WindowServices } from './context';

export function makeEditorPort(
  services: Pick<WindowServices, 'drafts' | 'store'> & Partial<Pick<WindowServices, 'draftChecks' | 'chem' | 'duplicateCheck'>>,
  timers: EditorPort['timers'],
  extras: { readonly depictions?: StructurePort['depictions']; readonly classes?: ClassPickerPort; readonly openRecord?: (ref: RecordRef) => void } = {},
): EditorPort {
  const { depictions, classes, openRecord } = extras;
  const { drafts, store } = services;
  return {
    entry: (id) => drafts.entry(id),
    subscribe: drafts.subscribe,
    keeping: () => drafts.view().keeping,
    edit: (id, recipe, meta) => drafts.edit(id, recipe, meta),
    undo: (id) => drafts.undo(id),
    redo: (id) => drafts.redo(id),
    release: (id) => drafts.release(id),
    commit: (id, choices, section) => drafts.commit(id, choices, section),
    discard: (id) => drafts.discard(id),
    warningsOf: (ref) => store.findings.bySubject(ref).filter((finding) => finding.severity === 'warning').length,
    ...(services.draftChecks === undefined ? {} : { checks: services.draftChecks }),
    ...(services.chem === undefined ? {} : { structure: { parse: (structure) => (services.chem as NonNullable<typeof services.chem>).parse(structure), ...(depictions === undefined ? {} : { depictions }) } }),
    ...(classes === undefined ? {} : { classes }),
    ...(services.duplicateCheck === undefined || openRecord === undefined ? {} : { duplicates: { check: services.duplicateCheck.check, openRecord } }),
    timers,
  };
}
