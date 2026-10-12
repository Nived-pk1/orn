/**
 * The top bar's controls (UI_ARCHITECTURE §2): what exists is enabled; what does not exist yet is listed, disabled, with the step that
 * brings it (note E8). The file menu's import is the import screen (5.9a); export is 5.9b (File, Export...). Step 5.8 adds Search (the palette), the exam-scope selector and Undo / Redo bound to the store.
 */
import { useSyncExternalStore } from 'react';
import { IconButton, Menu, useToasts, type MenuItem } from '@/ui/primitives';
import { ExamScopeSelector, type ExamScopeBinding } from './exam-scope-selector';

/** What the File menu needs of the window (step 5.9a): why an import cannot start, and the two actions. */
export interface FileBinding {
  /** Why "Import a file..." cannot run now (a read-only tab, another operation); undefined: it can. */
  readonly reason: string | undefined;
  readonly undoReason: string | undefined;
  readonly onImport: () => void;
  readonly onUndo: () => void;
  /** Opens the export screen (works in every tab mode). */
  readonly onExport: () => void;
}

const fileItems = (file: FileBinding): readonly MenuItem[] => [
  { id: 'import', label: 'Import a file...', ...(file.reason === undefined ? { onSelect: file.onImport } : { unavailable: file.reason }) },
  { id: 'export', label: 'Export...', onSelect: file.onExport },
  { id: 'undo_import', label: 'Undo import', ...(file.undoReason === undefined ? { onSelect: file.onUndo } : { unavailable: file.undoReason }) },
];

/** What Undo and Redo need of the store (the canonical store fits; a test passes a stub that has history). */
export interface HistoryBinding {
  canUndo(): boolean;
  canRedo(): boolean;
  isReadOnly(): boolean;
  undo(): { readonly ok: boolean; readonly error?: { readonly code: string; readonly message: string } } | null;
  redo(): { readonly ok: boolean; readonly error?: { readonly code: string; readonly message: string } } | null;
  subscribe(listener: () => void): () => void;
}

const LATER = 'editing arrives in Phase 6';

/** Why a history step cannot be taken, in words; undefined: it can. */
export function historyReason(store: HistoryBinding, direction: 'undo' | 'redo'): string | undefined {
  if (store.isReadOnly()) return 'this tab is read-only';
  if (direction === 'undo') return store.canUndo() ? undefined : `Nothing to undo (${LATER})`;
  return store.canRedo() ? undefined : `Nothing to redo (${LATER})`;
}

function History(props: { readonly store: HistoryBinding }) {
  const { store } = props;
  const toasts = useToasts();
  // one number per state of the history, so the buttons follow every commit
  const state = useSyncExternalStore(
    (onChange) => store.subscribe(onChange),
    () => `${store.isReadOnly() ? 1 : 0}${store.canUndo() ? 1 : 0}${store.canRedo() ? 1 : 0}`,
  );
  void state;
  const step = (direction: 'undo' | 'redo'): void => {
    const answer = direction === 'undo' ? store.undo() : store.redo();
    if (answer !== null && !answer.ok) toasts.push({ kind: 'error', text: `${direction === 'undo' ? 'Undo' : 'Redo'} failed (${answer.error?.code ?? 'UNKNOWN'}): ${answer.error?.message ?? 'no message'}` });
  };
  const undo = historyReason(store, 'undo');
  const redo = historyReason(store, 'redo');
  return (
    <>
      <IconButton label="Undo" icon="undo" {...(undo === undefined ? { onClick: () => step('undo') } : { unavailable: undo })} />
      <IconButton label="Redo" icon="redo" {...(redo === undefined ? { onClick: () => step('redo') } : { unavailable: redo })} />
    </>
  );
}

export function TopBar(props: { readonly onSearch: () => void; readonly history: HistoryBinding; readonly exam: ExamScopeBinding; readonly file: FileBinding }) {
  return (
    <>
      <Menu label="File" items={fileItems(props.file)} />
      <IconButton label="Search" icon="search" onClick={props.onSearch} aria-keyshortcuts="Control+K Meta+K" />
      <ExamScopeSelector binding={props.exam} />
      <History store={props.history} />
    </>
  );
}
