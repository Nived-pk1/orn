/**
 * Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y as the GLOBAL Undo and Redo of the store's history (ADR-040, step 6.1a part 4e), with two
 * guards: inside a text field the key is the field's own undo (the palette input never triggers the global one), and while a dialog is
 * open (an editor, whose keys are the DRAFT's undo and redo) the global history is left alone. When the step cannot be taken the reason
 * is said in a toast, never silent.
 */
import { useEffect } from 'react';
import { useToasts } from '@/ui/primitives';
import { historyReason, stepHistory, type HistoryBinding } from './top-bar';

const isEditable = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !== null) return true;
  const role = target.getAttribute('role');
  return role === 'textbox' || role === 'combobox' || role === 'searchbox';
};

export function HistoryKeys(props: { readonly history: HistoryBinding }) {
  const { history } = props;
  const toasts = useToasts();
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const direction = key === 'z' && !event.shiftKey ? 'undo' : (key === 'z' && event.shiftKey) || key === 'y' ? 'redo' : null;
      if (direction === null || isEditable(event.target) || document.querySelector('dialog[open]') !== null) return;
      const reason = historyReason(history, direction);
      event.preventDefault();
      if (reason !== undefined) toasts.push({ kind: 'info', text: `${direction === 'undo' ? 'Undo' : 'Redo'} is unavailable: ${reason}` });
      else stepHistory(history, direction, toasts);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [history, toasts]);
  return null;
}
