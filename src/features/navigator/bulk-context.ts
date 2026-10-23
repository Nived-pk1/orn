/**
 * What Studio lets the map do with a multi-selection (step 6.8b, R2). The Studio window provides it (`app/window/map-bulk-host.tsx`); the
 * Study window provides nothing, and then the map has NO multi-selection at all (nothing would act on it): Shift-click is a plain click, a
 * Shift-drag pans, there is no Select toggle. The map decides what the selection is (families and arrows); what a reaction is, and what
 * happens to it, belongs to the host that receives the IDs.
 */
import { createContext, useContext } from 'react';

export interface MapBulk {
  /** Why the bulk actions cannot run in this tab (read-only); undefined when they can. */
  readonly unavailable: string | undefined;
  /** "Mark verified (n)": the review queue's path, with its refusals and confirm. */
  markVerified(reactionIds: readonly string[]): void;
  /** "Delete (n)": ONE aggregated impact dialog and one undo step. */
  remove(reactionIds: readonly string[]): void;
}

export const MapBulkContext = createContext<MapBulk | undefined>(undefined);
export const useMapBulk = (): MapBulk | undefined => useContext(MapBulkContext);
