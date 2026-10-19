/** The editor's port filled from the app's session manager and store (ADR-040). Pure wiring; no chemistry. */
import type { EditorPort } from '@/features/workbench';
import type { WindowServices } from './context';

export function makeEditorPort(services: Pick<WindowServices, 'drafts' | 'store'> & Partial<Pick<WindowServices, 'draftChecks'>>, timers: EditorPort['timers']): EditorPort {
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
    timers,
  };
}
