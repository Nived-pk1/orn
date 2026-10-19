/**
 * The editors' entry points and their lazy chunk (ADR-040, step 6.1a part 4). `EditorsProvider` sits inside the toast provider: it owns
 * which editor and whether the drafts list is open, answers `editNames(ref)` (the inspector's button, the palette command) and
 * `openDrafts()` (the File menu, the start-up line), and loads the drafts list and the editor with `React.lazy` the first time one is
 * shown, so none of the editor is in the entry chunk. It fills the editor's port from the session manager; it knows no chemistry.
 */
import { lazy, Suspense, useCallback, useMemo, useState, type ReactNode } from 'react';
import type { RecordRef } from '@/core/schema';
import type { EditorPort } from '@/features/workbench';
import { makeEditorPort } from './editor-port';
import { useSubscribable } from '@/ui/hooks';
import { useToasts } from '@/ui/primitives';
import { useApp } from './context';
import { EditorsContext, type EditorsApi } from './drafts-ui';

const DraftsDialog = lazy(() => import('@/features/workbench/layer').then((m) => ({ default: m.DraftsDialog })));
const EditorHost = lazy(() => import('@/features/workbench/layer').then((m) => ({ default: m.EditorHost })));

/** Why editing cannot start in this tab now; undefined when it can (a session-only tab edits in memory and says so in the editor). */
export function editReasonOf(mode: string | null): string | undefined {
  if (mode === 'writer' || mode === 'session_only') return undefined;
  if (mode === null) return 'The app is still starting.';
  return 'This tab is read-only: edit in the tab that is saving';
}

export function EditorsProvider(props: { readonly children: ReactNode }) {
  const { services, inspector } = useApp();
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
      editReason: reason,
    }),
    [reason, services, show],
  );
  const port = useMemo<EditorPort>(() => makeEditorPort(services, inspector.timers, inspector.depictions), [services, inspector]);
  return (
    <EditorsContext.Provider value={api}>
      {props.children}
      {draftsOpen ? (
        <Suspense fallback={null}>
          <DraftsDialog
            open
            onClose={() => setDraftsOpen(false)}
            port={services.drafts}
            onOpenDraft={(id) => show(services.drafts.openStored(id))}
          />
        </Suspense>
      ) : null}
      {editingId === null ? null : (
        <Suspense fallback={null}>
          <EditorHost port={port} sessionId={editingId} open onClose={() => setEditingId(null)} />
        </Suspense>
      )}
    </EditorsContext.Provider>
  );
}
