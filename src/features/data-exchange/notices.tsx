/**
 * The import's results as toasts (a polite live region, UI_ARCHITECTURE section 11). Small and always loaded: the screen is a lazy
 * chunk, but "Imported 120 records" and its "Undo import" must show whether or not the screen is open. A clean, saved result goes away
 * by itself after a while; a warning stays until dismissed.
 */
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useToasts } from '@/ui/primitives';
import type { ImportModel } from './import-model';

export const RESULT_TOAST_MS = 20_000;

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
      ...(notice.kind === 'info' ? { autoDismissMs: RESULT_TOAST_MS } : {}),
      ...(notice.offerUndo ? { action: { label: 'Undo import', onAction: model.undoImport } } : {}),
    });
  }, [notice, toasts, model]);
  return null;
}
