/**
 * What the window does about exporting (step 5.9b): ONE model for the export screen and every way in (File, the palette, the Dataset
 * mode, the failed-save banner and the storage warning all call `open`). The screen is the data-exchange feature's lazy chunk; this
 * file only connects it. Export works in every tab mode.
 */
import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { createExportModel, LazyExportScreen } from '@/features/data-exchange';
import { useSubscribable } from '@/ui/hooks';
import { useApp } from './context';
import { createExportPorts, exportReason } from './export-port';

export interface ExportActions {
  /** Why an export cannot start now; undefined: it can. Opening is always possible; the screen says so itself. */
  readonly reason: string | undefined;
  open(): void;
}

export function useExportActions(): { readonly actions: ExportActions; readonly element: ReactNode } {
  const { services, navigator, nowMs } = useApp();
  const status = useSubscribable(services.status);
  const ports = useMemo(() => createExportPorts(services, nowMs ?? (() => 0), navigator.log), [services, navigator.log, nowMs]);
  const model = useMemo(() => createExportModel(ports), [ports]);
  useEffect(() => () => model.dispose(), [model]);
  const open = useCallback(() => model.open(), [model]);
  const actions = useMemo<ExportActions>(() => ({ reason: exportReason(status), open }), [status, open]);
  return { actions, element: <LazyExportScreen model={model} /> };
}
