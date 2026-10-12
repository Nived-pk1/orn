/**
 * Opens the export screen from places that do not own it (step 5.9b): the failed-save banner ("Export now") and the storage warning
 * ("Export a backup"). The window provides it; without a provider the action is not offered (a bare Banners in a test).
 */
import { createContext, useContext } from 'react';

export const ExportOpenContext = createContext<(() => void) | undefined>(undefined);

export const useExportOpen = (): (() => void) | undefined => useContext(ExportOpenContext);
