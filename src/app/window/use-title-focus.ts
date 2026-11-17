/**
 * When the first-run screen closes (data arrived, or Start empty) the control that had the focus is gone: the focus goes to the page title,
 * so the next Tab starts from the top in every engine (UI_ARCHITECTURE §11). Answers a counter the shell watches (split out of window.tsx, step 8.4g).
 */
import { useEffect, useRef, useState } from 'react';
import type { PanelsStore } from '@/ui/state';
import { usePanels } from '@/ui/state';

export function useTitleFocus(args: { readonly panels: PanelsStore; readonly status: { readonly stage: string; readonly mode: string | null }; readonly hasData: boolean; readonly busy: boolean }): number {
  const { panels, status, hasData, busy } = args;
  const startedEmpty = usePanels(panels, (s) => s.startEmptyDismissed);
  // (only once start-up has settled: a returning user's data arriving after boot is not a first run closing)
  const firstRunShown = status.stage !== 'booting' && status.mode !== null && !hasData && !startedEmpty;
  const wasFirstRun = useRef(firstRunShown);
  const [request, setRequest] = useState(0);
  const [wanted, setWanted] = useState(false);
  useEffect(() => {
    if (wasFirstRun.current && !firstRunShown) setWanted(true);
    wasFirstRun.current = firstRunShown;
  }, [firstRunShown]);
  // ...but only once the import has finished: while its dialog is modal the page is inert and a focus call does nothing
  useEffect(() => {
    if (!wanted || busy) return;
    setWanted(false);
    setRequest((n) => n + 1);
  }, [wanted, busy]);
  return request;
}
