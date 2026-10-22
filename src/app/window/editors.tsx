/**
 * The editors' entry points and their lazy chunk (ADR-040, step 6.1a part 4). `EditorsProvider` sits inside the toast provider: it owns
 * which editor and whether the drafts list is open, answers `editNames(ref)` (the inspector's button, the palette command) and
 * `openDrafts()` (the File menu, the start-up line), and loads the drafts list and the editor with `React.lazy` the first time one is
 * shown, so none of the editor is in the entry chunk. It fills the editor's port from the session manager; it knows no chemistry.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { RecordKind, RecordRef } from '@/core/schema';
import { useSubscribable } from '@/ui/hooks';
import { useToasts } from '@/ui/primitives';
import { useApp } from './context';
import { createLocalTimeFormatter } from './local-time';
import { EditorsContext, type EditorsApi } from './drafts-ui';
import type { EditorEntries } from './editor-entries';
import type { TemplateMode } from './template-dialog';
import { duplicateSeed, specificSeed } from '@/core/editing';

// /* @__PURE__ */: an unused lazy() is dropped with its import() in Study, where nothing mounts EditorsProvider (ADR-041)
const DraftsDialog = /* @__PURE__ */ lazy(() => import('@/features/workbench/layer').then((m) => ({ default: m.DraftsDialog })));
// the session builds its port (pickers, preview) where it opens, so that code is in the editor's chunk and not in the entry (step 6.5a)
const EditorSession = /* @__PURE__ */ lazy(() => import('./editor-session').then((m) => ({ default: m.EditorSession })));

const TemplateDialog = /* @__PURE__ */ lazy(() => import('./template-dialog').then((m) => ({ default: m.TemplateDialog })));

const machineTime = /* @__PURE__ */ createLocalTimeFormatter();
const NO_ENTRIES: EditorsApi['entries'] = [];

/** Why editing cannot start in this tab now; undefined when it can (a session-only tab edits in memory and says so in the editor). */
export function editReasonOf(mode: string | null): string | undefined {
  if (mode === 'writer' || mode === 'session_only') return undefined;
  if (mode === null) return 'The app is still starting.';
  return 'This tab is read-only: edit in the tab that is saving';
}

const nameOfReaction = (record: { readonly name?: string } | undefined): string => (record?.name === undefined || record.name === '' ? 'this reaction' : record.name);

export function EditorsProvider(props: { readonly children: ReactNode }) {
  const { services, formatTime: injected, editorEntries, inspector } = useApp();
  const formatTime = injected ?? machineTime;
  const toasts = useToasts();
  const status = useSubscribable(services.status);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // the nested editor of "Create new" (step 6.7a): one at a time, over the editor that asked; `done` picks its record into that editor
  const [nested, setNested] = useState<{ readonly id: string; readonly done: (ref: RecordRef) => void } | null>(null);
  const nestedOpen = useRef(false);
  // the question before a copy or a specific reaction (step 6.7a)
  const [template, setTemplate] = useState<{ readonly mode: TemplateMode; readonly ref: RecordRef } | null>(null);
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
      if (nestedOpen.current) {
        toasts.push({ kind: 'info', text: 'Finish the new record that is open first' });
        return;
      }
      if (!answer.ok) {
        toasts.push({ kind: 'warning', text: answer.message });
        return;
      }
      setDraftsOpen(false);
      setEditingId(answer.id);
    },
    [services, toasts],
  );
  const startNested = useCallback(
    (kind: RecordKind, seed: Readonly<Record<string, unknown>>, done: (ref: RecordRef) => void): void => {
      if (nestedOpen.current) return; // one level only
      const answer = services.drafts.open({ kind, blank: true, seed });
      if (!answer.ok) {
        toasts.push({ kind: 'warning', text: answer.message });
        return;
      }
      nestedOpen.current = true;
      setNested({ id: answer.id, done });
    },
    [services, toasts],
  );
  const api = useMemo<EditorsApi>(
    () => ({
      openDrafts: () => setDraftsOpen(true),
      editNames: (ref: RecordRef) => show(services.drafts.open(ref)),
      startFrom: (mode: TemplateMode, ref: RecordRef) => setTemplate({ mode, ref }),
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
      {template === null ? null : (
        <Suspense fallback={null}>
          <TemplateDialog
            mode={template.mode}
            name={nameOfReaction(services.store.getState().records.reaction[template.ref.id as never])}
            onCancel={() => setTemplate(null)}
            onStart={() => {
              const seed = (template.mode === 'duplicate' ? duplicateSeed : specificSeed)(services.store.getState(), template.ref, { newId: (prefix) => services.drafts.newId(prefix) });
              setTemplate(null);
              if (seed === undefined) {
                toasts.push({ kind: 'warning', text: 'That reaction is no longer there, or it is not generic.' });
                return;
              }
              if (editingId !== null) services.drafts.release(editingId); // the editor it was started from keeps its draft, if it has one
              show(services.drafts.open({ kind: 'reaction', blank: true, seed }));
            }}
          />
        </Suspense>
      )}
      {editingId === null ? null : (
        <Suspense fallback={null}>
          <EditorSession key={editingId} sessionId={editingId} formatTime={formatTime} onClose={() => setEditingId(null)} onStart={(kind, seed) => show(services.drafts.open({ kind, blank: true, seed }))} onEdit={(ref) => show(services.drafts.open(ref))} onCreate={startNested} onFrom={(mode, ref) => setTemplate({ mode, ref })} covered={nested !== null} />
        </Suspense>
      )}
      {nested === null ? null : (
        <Suspense fallback={null}>
          <EditorSession
            key={nested.id}
            sessionId={nested.id}
            formatTime={formatTime}
            nested
            onSaved={nested.done}
            onClose={() => {
              nestedOpen.current = false;
              setNested(null);
            }}
          />
        </Suspense>
      )}
    </EditorsContext.Provider>
  );
}
