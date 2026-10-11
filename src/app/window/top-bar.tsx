/**
 * The top bar's controls (UI_ARCHITECTURE §2): what exists is enabled; what does not exist yet is listed, disabled, with the step that
 * brings it (note E8). The file menu's import and export are the full import and export screens (5.9a, 5.9b): until then the
 * first-run screen is the only way in. Step 5.8 adds Search (the palette), the exam-scope selector and Undo / Redo bound to the store.
 */
import { useSyncExternalStore } from 'react';
import { IconButton, Menu, useToasts } from '@/ui/primitives';
import { ExamScopeSelector, type ExamScopeBinding } from './exam-scope-selector';

const FILE_ITEMS = [
  { id: 'import', label: 'Import a file', unavailable: 'step 5.9a (use the first-run screen until then)' },
  { id: 'export', label: 'Export', unavailable: 'step 5.9b' },
  { id: 'undo_import', label: 'Undo import', unavailable: 'step 5.9a' },
] as const;

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

export function TopBar(props: { readonly onSearch: () => void; readonly history: HistoryBinding; readonly exam: ExamScopeBinding }) {
  return (
    <>
      <Menu label="File" items={FILE_ITEMS} />
      <IconButton label="Search" icon="search" onClick={props.onSearch} aria-keyshortcuts="Control+K Meta+K" />
      <ExamScopeSelector binding={props.exam} />
      <History store={props.history} />
    </>
  );
}
