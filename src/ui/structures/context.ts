/**
 * The app-wide Structures setting (Skeletal | Condensed | Full), handed down to every page header (step 8.5h B1). The same setting as the
 * depiction port's mode: the app provides it once; a page without it shows no control.
 */
import { createContext } from 'react';
import type { StructureMode } from '@/chem/contracts';

export interface StructuresSetting {
  mode(): StructureMode;
  setMode(mode: StructureMode): void;
  subscribe(listener: () => void): () => void;
}

export const StructuresContext = createContext<StructuresSetting | null>(null);
