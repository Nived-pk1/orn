/**
 * The window's side of Starred and Recent (step 8.4g Part B, G2 and G3): the port the inspector's star button uses, and a part that draws
 * nothing and keeps two promises: the key S stars the selected record, and every record the inspector shows becomes the newest recent one.
 */
import { lazy, Suspense, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import type { StarsPort } from '@/features/inspector';
import type { ActiveExamStore } from '@/ui/state';
import { useApp } from './context';
import type { CommandDeps } from './palette-commands';
import { openShortcuts, shortcutsStore } from './shortcuts-state';

const IDLE_MS = 1500;
const NEVER = (): (() => void) => () => undefined;

/** The star port for the inspector: absent until the late chunk has loaded the rules and attached it (so the star is not drawn, and never drawn wrong). */
export function useStarsPort(): StarsPort | undefined {
  const { mine } = useApp();
  return useSyncExternalStore(mine?.subscribe ?? NEVER, () => mine?.late())?.port;
}

let loading: ReturnType<typeof importKeys> | undefined;
const importKeys = () => import('./window-keys');
const loadKeys = (): ReturnType<typeof importKeys> => (loading ??= importKeys());
const Keys = /* @__PURE__ */ lazy(loadKeys);
/** Fetches the chunk now (a window test that resets its module registry loads it in its own registry first). */
export const prefetchLateKeys = loadKeys;

/** Draws nothing. Loads the late keys and the rules on idle after boot, when the data is there (a record can only be shown then), or when the shortcuts sheet is asked for, whichever comes first (a chunk, not the entry). */
export function MyRecordsHost(props: { readonly studio: boolean; readonly exam: ActiveExamStore; readonly hasData: boolean }) {
  const asked = useStore(shortcutsStore, (s) => s.open);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setArmed(true), asked || props.hasData ? 0 : IDLE_MS);
    return () => clearTimeout(timer);
  }, [asked, props.hasData]);
  if (!armed) return null;
  return (
    <Suspense fallback={null}>
      <Keys studio={props.studio} exam={props.exam} hasData={props.hasData} />
    </Suspense>
  );
}

/** The palette's star and shortcuts commands, read when the palette asks for its list (so the selection and the star are the current ones). */
export function useMineCommandDeps(): () => Pick<CommandDeps, 'star' | 'showShortcuts'> {
  const { mine } = useApp();
  return useCallback(() => ({ showShortcuts: openShortcuts, star: mine?.late()?.star() }), [mine]);
}
