/**
 * The phone's tab and the window's mode (split out of window.tsx for its size, step 8.4f): the Explore tab IS the Reactions mode (step 7.1b E1),
 * the other tabs are the Navigator, Chapters its own; and a press on a phone tab leaves Settings even when it is the tab that was already
 * chosen (no store changes then, so the effect on the tab never runs: the press itself leaves it).
 */
import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import { CHAPTERS_MODE, EXPLORER_MODES, NAVIGATOR_MODE, SETTINGS_MODE, STARRED_MODE } from './modes';

/** The mode after a press on `tab` while `current` is shown: Settings and Starred give way to the tab's mode, every other mode stays. Pure. */
export function modeAfterPhoneTab(current: string, tab: string, explorerMode: () => string): string {
  if (current !== SETTINGS_MODE && current !== STARRED_MODE) return current;
  return tab === 'explore' ? explorerMode() : tab === 'chapters' ? CHAPTERS_MODE : NAVIGATOR_MODE;
}

export function usePhoneTabMode(args: {
  readonly phone: boolean;
  readonly phoneTab: string;
  readonly explorerMode: () => string;
  readonly setMode: Dispatch<SetStateAction<string>>;
}): (tab: string) => void {
  const { phone, phoneTab, explorerMode, setMode } = args;
  const explorer = explorerMode();
  useEffect(() => {
    if (!phone) return;
    if (phoneTab === 'explore') setMode(explorer);
    else if (phoneTab === 'chapters') setMode(CHAPTERS_MODE);
    else setMode((current) => (EXPLORER_MODES.includes(current) || current === CHAPTERS_MODE ? NAVIGATOR_MODE : current));
  }, [phone, phoneTab, explorer, setMode]);
  return useCallback((tab: string) => setMode((current) => modeAfterPhoneTab(current, tab, explorerMode)), [setMode, explorerMode]);
}
