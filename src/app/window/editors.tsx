/**
 * The editors' entry points and their lazy chunk (ADR-040, step 6.1a part 4). `EditorsProvider` sits inside the toast provider: it owns
 * which editor and whether the drafts list is open, answers `editNames(ref)` (the inspector's button, the palette command) and
 * `openDrafts()` (the File menu, the start-up line), and loads the drafts list and the editor with `React.lazy` the first time one is
 * shown, so none of the editor is in the entry chunk. It fills the editor's port from the session manager; it knows no chemistry.
 */
import { lazy, Suspense, useCallback, useMemo, useState, type ReactNode } from 'react';
import type { RecordRef } from '@/core/schema';
import { useSubscribable } from '@/ui/hooks';
import { useToasts } from '@/ui/primitives';
import { useApp } from './context';
import { createLocalTimeFormatter } from './local-time';
import { NAMES_KINDS } from '@/core/editing/names';
import { EditorsContext, type EditorsApi } from './drafts-ui';

// /* @__PURE__ */: an unused lazy() is dropped with its import() in Study, where nothing mounts EditorsProvider (ADR-041)
const DraftsDialog = /* @__PURE__ */ lazy(() => import('@/features/workbench/layer').then((m) => ({ default: m.DraftsDialog })));
// the session builds its port (pickers, preview) where it opens, so that code is in the editor's chunk and not in the entry (step 6.5a)
const EditorSession = /* @__PURE__ */ lazy(() => import('./editor-session').then((m) => ({ default: m.EditorSession })));

const machineTime = /* @__PURE__ */ createLocalTimeFormatter();

/** The kinds whose editor is the full one (the others edit names only). */
const FULL_EDITOR_KINDS: readonly string[] = ['species', 'class', 'reagent', 'reaction', 'mechanism', 'reference', 'concept', 'named_reaction', 'transformation'];

/** Why editing cannot start in this tab now; undefined when it can (a session-only tab edits in memory and says so in the editor). */
export function editReasonOf(mode: string | null): string | undefined {
  if (mode === 'writer' || mode === 'session_only') return undefined;
  if (mode === null) return 'The app is still starting.';
  return 'This tab is read-only: edit in the tab that is saving';
}

export function EditorsProvider(props: { readonly children: ReactNode }) {
  const { services, formatTime: injected } = useApp();
  const formatTime = injected ?? machineTime;
  const toasts = useToasts();
  const status = useSubscribable(services.status);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const reason = editReasonOf(status.mode);

  const show = useCallback(
    (answer: ReturnType<typeof services.drafts.open>): void => {
      if (!answer.ok) {
        toasts.push({ kind: 'warning', text: answer.message });
        return;
      }
      setDraftsOpen(false);
      setEditingId(answer.id);
    },
    [services, toasts],
  );
  const api = useMemo<EditorsApi>(
    () => ({
      openDrafts: () => setDraftsOpen(true),
      editNames: (ref: RecordRef) => show(services.drafts.open(ref)),
      newSpecies: () => show(services.drafts.open({ kind: 'species', blank: true })),
      newClass: () => show(services.drafts.open({ kind: 'class', blank: true })),
      newReagent: () => show(services.drafts.open({ kind: 'reagent', blank: true })),
      newReaction: () => show(services.drafts.open({ kind: 'reaction', blank: true })),
      newMechanism: () => show(services.drafts.open({ kind: 'mechanism', blank: true })),
      newSource: () => show(services.drafts.open({ kind: 'reference', blank: true })),
      newConcept: () => show(services.drafts.open({ kind: 'concept', blank: true })),
      newNamedReaction: () => show(services.drafts.open({ kind: 'named_reaction', blank: true })),
      newTransformation: () => show(services.drafts.open({ kind: 'transformation', blank: true })),
      openDraft: (id: string) => show(services.drafts.openStored(id)),
      editReason: reason,
      fullEditorKinds: FULL_EDITOR_KINDS,
      namesKinds: NAMES_KINDS,
    }),
    [reason, services, show],
  );
  return (
    <EditorsContext.Provider value={api}>
      {props.children}
      {draftsOpen ? (
        <Suspense fallback={null}>
          <DraftsDialog
            open
            onClose={() => setDraftsOpen(false)}
            port={services.drafts}
            formatTime={formatTime}
            onOpenDraft={(id) => show(services.drafts.openStored(id))}
          />
        </Suspense>
      ) : null}
      {editingId === null ? null : (
        <Suspense fallback={null}>
          <EditorSession sessionId={editingId} formatTime={formatTime} onClose={() => setEditingId(null)} />
        </Suspense>
      )}
    </EditorsContext.Provider>
  );
}
