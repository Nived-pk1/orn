/** Whether the keyboard shortcuts sheet is open (step 8.4g Part B, G5): a small store, so the key, the palette command and the Settings link open the same sheet. */
import { createStore } from 'zustand/vanilla';

export const shortcutsStore = createStore<{ open: boolean }>(() => ({ open: false }));
export const openShortcuts = (): void => shortcutsStore.setState({ open: true });
