/**
 * The editors' entry points and their lazy chunk (ADR-040, step 6.1a part 4). `EditorsProvider` sits inside the toast provider: it owns
 * which editor and whether the drafts list is open, answers `editNames(ref)` (the inspector's button, the palette command) and
 * `openDrafts()` (the File menu, the start-up line), and loads the drafts list and the editor with `React.lazy` the first time one is
 * shown, so none of the editor is in the entry chunk. It fills the editor's port from the session manager; it knows no chemistry.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { RecordKind, RecordRef } from '@/core/schema';
import { useSubscribable } from '@/ui/hooks';
import { useToasts } from '@/ui/primitives';
import { useApp } from './context';
import { createLocalTimeFormatter } from './local-time';
import { EditorsContext, type EditorsApi } from './drafts-ui';
import type { EditorEntries } from './editor-entries';

// /* @__PURE__ */: an unused lazy() is dropped with its import() in Study, where nothing mounts EditorsProvider (ADR-041)
const DraftsDialog = /* @__PURE__ */ lazy(() => import('@/features/workbench/layer').then((m) => ({ default: m.DraftsDialog })));
// the session builds its port (pickers, preview) where it opens, so that code is in the editor's chunk and not in the entry (step 6.5a)
const EditorSession = /* @__PURE__ */ lazy(() => import('./editor-session').then((m) => ({ default: m.EditorSession })));

const machineTime = /* @__PURE__ */ createLocalTimeFormatter();
const NO_ENTRIES: EditorsApi['entries'] = [];

/** Why editing cannot start in this tab now; undefined when it can (a session-only tab edits in memory and says so in the editor). */
export function editReasonOf(mode: string | null): string | undefined {
  if (mode === 'writer' || mode === 'session_only') return undefined;
  if (mode === null) return 'The app is still starting.';
  return 'This tab is read-only: edit in the tab that is saving';
}

export function EditorsProvider(props: { readonly children: ReactNode }) {
  const { services, formatTime: injected, editorEntries, inspector } = useApp();
  const formatTime = injected ?? machineTime;
  const toasts = useToasts();
  const status = useSubscribable(services.status);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // the entry points (titles, palette words, the full-editor kinds) are a lazy chunk, loaded after the first paint (entry room, exams step)
  const [entries, setEntries] = useState<EditorEntries | null>(editorEntries ?? null);
  useEffect(() => {
    if (entries !== null) return undefined;
    let live = true;
    const cancel = inspector.timers.after(0, () => void import('./editor-entries').then((m) => live && setEntries(m.EDITOR_ENTRIES)));
    return () => {
      live = false;
      cancel();
    };
  }, [entries, inspector.timers]);
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
      startNew: (kind: RecordKind, seed: Readonly<Record<string, unknown>>) => show(services.drafts.open({ kind, blank: true, seed })),
      openDraft: (id: string) => show(services.drafts.openStored(id)),
      editReason: reason,
      entries: entries?.entries ?? NO_ENTRIES,
      ...(entries === null ? {} : { fullEditorKinds: entries.fullEditorKinds, namesKinds: entries.namesKinds }),
    }),
    [entries, reason, services, show],
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
          <EditorSession key={editingId} sessionId={editingId} formatTime={formatTime} onClose={() => setEditingId(null)} onStart={(kind, seed) => show(services.drafts.open({ kind, blank: true, seed }))} onEdit={(ref) => show(services.drafts.open(ref))} />
        </Suspense>
      )}
    </EditorsContext.Provider>
  );
}
