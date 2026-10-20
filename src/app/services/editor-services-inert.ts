/**
 * The Study edition's stand-ins for the editor services (studio step E1, ADR-041): the draft manager and the two checks an editor asks,
 * with the shapes of the real ones so `AppServices` keeps its type and nothing outside `create.ts` knows the difference. Nothing is read
 * from or written to storage: drafts already stored in this browser (editors were public from 6.2 to 6.5) are neither listed nor touched.
 * `create.ts` uses these only when `EDITING` is false, so the real manager, `@/core/editing` and the checks are not in the Study build.
 */
import type { DraftChecksPort, DuplicateCheckPort } from '@/features/workbench';
import type { DraftManager, DraftsView } from './drafts-types';

const WORDS = 'Editing is not available in this edition.';
const EMPTY: DraftsView = { items: [], count: 0, keeping: 'stored' };
const refuse = async (): Promise<never> => {
  throw new Error(WORDS);
};
const never = (): (() => void) => () => undefined;

export function createInertEditorServices(): { readonly drafts: DraftManager; readonly draftChecks: DraftChecksPort; readonly duplicateCheck: DuplicateCheckPort } {
  const drafts: DraftManager = {
    view: () => EMPTY,
    entry: () => undefined,
    subscribe: never,
    open: () => ({ ok: false, reason: 'read_only', message: WORDS }),
    openStored: () => ({ ok: false, reason: 'not_found', message: WORDS }),
    edit: () => undefined,
    undo: () => undefined,
    redo: () => undefined,
    release: () => undefined,
    commit: async () => ({ ok: false, reason: 'gone' }),
    discard: async () => undefined,
    discardUnreadable: async () => undefined,
    flush: async () => undefined,
    newId: () => {
      throw new Error(WORDS);
    },
    refresh: async () => undefined,
    dispose: () => undefined,
  };
  return { drafts, draftChecks: { dryRun: refuse, structure: refuse }, duplicateCheck: { check: refuse } };
}
