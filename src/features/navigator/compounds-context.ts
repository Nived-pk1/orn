/**
 * What Studio lets the map's legend do with the compounds that are in no family (step 8.2a, D5): open one in the inspector. The Studio window
 * provides it (`app/window/map-bulk-host.tsx`); the Study window provides nothing, and then the legend has no "See those compounds" link.
 */
import { createContext, useContext } from 'react';
import type { RecordRef } from '@/core/schema';

export interface MapCompounds {
  open(ref: RecordRef): void;
}

export const MapCompoundsContext = createContext<MapCompounds | undefined>(undefined);
export const useMapCompounds = (): MapCompounds | undefined => useContext(MapCompoundsContext);
