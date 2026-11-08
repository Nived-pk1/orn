/**
 * The import's results as toasts (a polite live region, UI_ARCHITECTURE section 11). Small and always loaded: the screen is a lazy
 * chunk, but "Imported 120 records" and its "Undo import" must show whether or not the screen is open. A clean, saved result goes away
 * by itself after a while; a warning stays until dismissed.
 */
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { ACTION_TOAST_MS, RESULT_TOAST_MS as PLAIN_TOAST_MS, useToasts } from '@/ui/primitives';
import type { ImportModel } from './import-model';

/** A clean result leaves after 5 s, one that offers Undo import after 10 s (step 8.4d; Undo import is also in the File menu). */
export const RESULT_TOAST_MS = PLAIN_TOAST_MS;

export function ImportNotices(props: { readonly model: ImportModel }) {
  const { model } = props;
  const notice = useStore(model.store, (state) => state.notice);
  const toasts = useToasts();
  const shown = useRef(0);
  useEffect(() => {
    if (notice === undefined || notice.serial === shown.current) return;
    shown.current = notice.serial;
    toasts.push({
      kind: notice.kind,
      text: notice.text,
      ...(notice.kind === 'info' ? { autoDismissMs: notice.offerUndo ? ACTION_TOAST_MS : PLAIN_TOAST_MS } : {}),
      ...(notice.offerUndo ? { action: { label: 'Undo import', onAction: model.undoImport } } : {}),
    });
  }, [notice, toasts, model]);
  return null;
}
