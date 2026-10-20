/**
 * The editors' entry points and their lazy chunk (ADR-040, step 6.1a part 4). `EditorsProvider` sits inside the toast provider: it owns
 * which editor and whether the drafts list is open, answers `editNames(ref)` (the inspector's button, the palette command) and
 * `openDrafts()` (the File menu, the start-up line), and loads the drafts list and the editor with `React.lazy` the first time one is
 * shown, so none of the editor is in the entry chunk. It fills the editor's port from the session manager; it knows no chemistry.
 */
import { lazy, Suspense, useCallback, useMemo, useState, type ReactNode } from 'react';
import type { RecordRef } from '@/core/schema';
import { previewOfDraft } from '@/core/graph';
import type { EditorPort, PreviewPort } from '@/features/workbench';
import { EQUATION_AREA } from '@/render/equation/contracts';
import { createDepictionBinding } from '@/render/svg';
import { makeEditorPort } from './editor-port';
import { createRecordPicker } from './record-picker-port';
import { useSubscribable } from '@/ui/hooks';
import { useToasts } from '@/ui/primitives';
import { useApp } from './context';
import { createLocalTimeFormatter } from './local-time';
import { EditorsContext, type EditorsApi } from './drafts-ui';

const DraftsDialog = lazy(() => import('@/features/workbench/layer').then((m) => ({ default: m.DraftsDialog })));
const EditorHost = lazy(() => import('@/features/workbench/layer').then((m) => ({ default: m.EditorHost })));

const machineTime = createLocalTimeFormatter();

/** The kinds whose editor is the full one (the others edit names only). */
const FULL_EDITOR_KINDS: readonly string[] = ['species', 'class', 'reagent', 'reaction'];

/** Why editing cannot start in this tab now; undefined when it can (a session-only tab edits in memory and says so in the editor). */
export function editReasonOf(mode: string | null): string | undefined {
  if (mode === 'writer' || mode === 'session_only') return undefined;
  if (mode === null) return 'The app is still starting.';
  return 'This tab is read-only: edit in the tab that is saving';
}

export function EditorsProvider(props: { readonly children: ReactNode }) {
  const { services, inspector, formatTime: injected } = useApp();
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
      openDraft: (id: string) => show(services.drafts.openStored(id)),
      editReason: reason,
      fullEditorKinds: FULL_EDITOR_KINDS,
    }),
    [reason, services, show],
  );
  const port = useMemo<EditorPort>(() => {
    const records = createRecordPicker({
      search: services.search.search,
      state: services.store.getState,
      indexes: inspector.indexes.current,
      activeExam: () => inspector.ui.exam?.getState().active ?? null,
    });
    const openRecord = (ref: RecordRef): void => {
      inspector.ui.inspector.getState().open(ref);
      inspector.ui.panels.getState().setInspectorOpen(true);
    };
    // the live preview of a reaction draft: the core builds it from the current state and indexes (nothing is stored); it follows the Structures setting through the depiction port
    const panels = inspector.ui.panels;
    const preview: PreviewPort = {
      build: (draft) => previewOfDraft(services.store.getState(), inspector.indexes.current(), draft),
      binding: inspector.depictions === undefined ? undefined : createDepictionBinding(inspector.depictions, inspector.timers, EQUATION_AREA),
      facts: inspector.facts,
      timers: inspector.timers,
      names: { get: () => panels.getState().equationNames, set: (names) => panels.getState().setEquationNames(names), subscribe: (listener) => panels.subscribe(() => listener()) },
    };
    return makeEditorPort(services, inspector.timers, { ...(inspector.depictions === undefined ? {} : { depictions: inspector.depictions }), records, openRecord, preview });
  }, [services, inspector]);
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
          <EditorHost port={port} sessionId={editingId} open formatTime={formatTime} onClose={() => setEditingId(null)} />
        </Suspense>
      )}
    </EditorsContext.Provider>
  );
}
