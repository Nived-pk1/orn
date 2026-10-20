/**
 * The top bar's controls (UI_ARCHITECTURE §2): what exists is enabled; what does not exist yet is listed, disabled, with the step that
 * brings it (note E8). The file menu's import is the import screen (5.9a); export is 5.9b (File, Export...). Step 5.8 adds Search (the palette), the exam-scope selector and Undo / Redo bound to the store.
 */
import { useSyncExternalStore } from 'react';
import { IconButton, Menu, useToasts, type MenuItem, type Toasts } from '@/ui/primitives';
import { useDraftsView, useEditors } from './drafts-ui';
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
  /** Opens "About this preview". */
  readonly onAbout: () => void;
  /** The drafts list (ADR-040): the count the item says and how to open it. Absent: no item. */
  readonly drafts?: { readonly count: number | null; readonly onOpen: () => void };
}

export const fileItems = (file: FileBinding): readonly MenuItem[] => [
  { id: 'import', label: 'Import a file...', ...(file.reason === undefined ? { onSelect: file.onImport } : { unavailable: file.reason }) },
  { id: 'export', label: 'Export...', onSelect: file.onExport },
  { id: 'undo_import', label: 'Undo import', ...(file.undoReason === undefined ? { onSelect: file.onUndo } : { unavailable: file.undoReason }) },
  ...(file.drafts === undefined ? [] : [{ id: 'drafts', label: `Drafts (${file.drafts.count ?? 0})`, onSelect: file.drafts.onOpen }]),
  { id: 'about', label: 'About this preview', onSelect: file.onAbout },
];

/** What Undo and Redo need of the store (the canonical store fits; a test passes a stub that has history). */
export interface HistoryBinding {
  canUndo(): boolean;
  canRedo(): boolean;
  isReadOnly(): boolean;
  undo(): { readonly ok: boolean; readonly error?: { readonly code: string; readonly message: string } } | null;
  redo(): { readonly ok: boolean; readonly error?: { readonly code: string; readonly message: string } } | null;
  subscribe(listener: () => void): () => void;
  /** The labels of the entries, the next one first (the canonical store has it; a stub may not). Absent: the buttons say just Undo and Redo. */
  historyLabels?(): { readonly undo: readonly string[]; readonly redo: readonly string[] };
}

/** Why a history step cannot be taken, in words; undefined: it can. */
export function historyReason(store: HistoryBinding, direction: 'undo' | 'redo'): string | undefined {
  if (store.isReadOnly()) return 'this tab is read-only';
  if (direction === 'undo') return store.canUndo() ? undefined : 'Nothing to undo';
  return store.canRedo() ? undefined : 'Nothing to redo';
}

/** One history step; a refusal is said in a toast with its code. */
export function stepHistory(store: HistoryBinding, direction: 'undo' | 'redo', toasts: Toasts): void {
  const answer = direction === 'undo' ? store.undo() : store.redo();
  if (answer !== null && !answer.ok) toasts.push({ kind: 'error', text: `${direction === 'undo' ? 'Undo' : 'Redo'} failed (${answer.error?.code ?? 'UNKNOWN'}): ${answer.error?.message ?? 'no message'}` });
}

/** The button's name: "Undo Edit names of Ethanol" when there is a step and the store knows its label, else just "Undo". */
export function historyLabelOf(store: HistoryBinding, direction: 'undo' | 'redo'): string {
  const word = direction === 'undo' ? 'Undo' : 'Redo';
  const next = (store.historyLabels?.()[direction] ?? [])[0];
  return next === undefined || (direction === 'undo' ? !store.canUndo() : !store.canRedo()) ? word : `${word} ${next}`;
}

/** One value per state of the history (and its next labels), so a view follows every commit, undo and redo. */
export const historySnapshot = (store: HistoryBinding): string => `${store.isReadOnly() ? 1 : 0}${store.canUndo() ? 1 : 0}${store.canRedo() ? 1 : 0}|${historyLabelOf(store, 'undo')}|${historyLabelOf(store, 'redo')}`;

function History(props: { readonly store: HistoryBinding }) {
  const { store } = props;
  const toasts = useToasts();
  useSyncExternalStore((onChange) => store.subscribe(onChange), () => historySnapshot(store));
  const undo = historyReason(store, 'undo');
  const redo = historyReason(store, 'redo');
  return (
    <>
      <IconButton label={historyLabelOf(store, 'undo')} icon="undo" aria-keyshortcuts="Control+Z Meta+Z" {...(undo === undefined ? { onClick: () => stepHistory(store, 'undo', toasts) } : { unavailable: undo })} />
      <IconButton label={historyLabelOf(store, 'redo')} icon="redo" aria-keyshortcuts="Control+Shift+Z Control+Y Meta+Shift+Z" {...(redo === undefined ? { onClick: () => stepHistory(store, 'redo', toasts) } : { unavailable: redo })} />
    </>
  );
}

/** The file binding with the drafts item (ADR-040): the count and how to open the list, from the window's editors. */
export function useFileWithDrafts(file: FileBinding): FileBinding {
  const editors = useEditors();
  const count = useDraftsView().count;
  return editors === null ? file : { ...file, drafts: { count, onOpen: editors.openDrafts } };
}

export function TopBar(props: { readonly onSearch: () => void; readonly history?: HistoryBinding; readonly exam: ExamScopeBinding; readonly file: FileBinding }) {
  const file = useFileWithDrafts(props.file);
  return (
    <>
      <Menu label="File" items={fileItems(file)} />
      <IconButton label="Search" icon="search" onClick={props.onSearch} aria-keyshortcuts="Control+K Meta+K" />
      <ExamScopeSelector binding={props.exam} />
      {props.history === undefined ? null : <History store={props.history} />}
    </>
  );
}
