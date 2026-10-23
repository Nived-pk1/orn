/**
 * How a form asks for the Delete dialog (step 6.8a): the editor host provides `port.chain.remove` here, so a section deep in a form (the
 * class editor's Map family, a mechanism's pictures) can offer "Remove from the map" / "Delete picture" without the form knowing the window.
 * Absent (a nested editor, a unit test without it): the sections offer nothing.
 */
import { createContext, useContext } from 'react';
import type { RecordRef } from '@/core/schema';

export const RemoveContext = createContext<((ref: RecordRef) => void) | undefined>(undefined);
export const useRemove = (): ((ref: RecordRef) => void) | undefined => useContext(RemoveContext);
