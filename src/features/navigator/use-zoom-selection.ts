/**
 * "Zoom to selection" (step 8.4b, E2b): the hook only says whether there is something to zoom to and loads the work
 * (`zoom-selection-run.ts`) on the first click, so the fitting code is not in the initial chunk (8.4b size round).
 */
import { useCallback } from 'react';
import type { ZoomSelectionArgs } from './zoom-selection-run';

export function useZoomToSelection(args: ZoomSelectionArgs): { readonly zoom: () => void; readonly available: boolean } {
  const { controller, svg, drawn, selected, chain, outlined } = args;
  const available = drawn !== null && (chain !== undefined ? chain.length > 0 : selected !== null);
  const zoom = useCallback((): void => {
    void import('./zoom-selection-run').then((run) => run.runZoomToSelection({ controller, svg, drawn, selected, chain, outlined }));
  }, [controller, svg, drawn, selected, chain, outlined]);
  return { zoom, available };
}
