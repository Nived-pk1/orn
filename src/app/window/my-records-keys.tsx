/**
 * The window side of Starred and Recent that needs the rules (step 8.4g Part B), a lazy chunk mounted on idle or at the first record shown:
 * it loads the store, hands the star port and the palette star command to the window, makes the key S star the selected record, and makes
 * every record the inspector shows the newest recent one.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import { currentOf } from '@/ui/state';
import type { RecordRef } from '@/core/schema';
import { useApp } from './context';
import { useFace } from './my-records-face';
import { StarKey } from './star-key';
import { useToggleStar } from './use-toggle-star';

const NEVER = (): (() => void) => () => undefined;

export default function MyRecordsKeys() {
  const { mine, inspector } = useApp();
  const shown = useStore(inspector.ui.inspector, (s) => currentOf(s));
  const kind = shown?.kind;
  const id = shown?.id;
  const face = useFace(mine);
  const ready = useSyncExternalStore(mine?.subscribe ?? NEVER, () => mine?.records() !== undefined);
  const toggle = useToggleStar(face);
  const latest = useRef(toggle);
  latest.current = toggle;
  useEffect(() => {
    if (mine === undefined || !ready) return undefined;
    mine.attach({
      port: { isStarred: face.isStarred, toggle: (ref) => latest.current(ref), subscribe: face.subscribe },
      star: () => {
        const selected = currentOf(inspector.ui.inspector.getState());
        return { starred: selected !== null && face.isStarred(selected), run: selected === null ? undefined : () => latest.current(selected) };
      },
    });
    return () => mine.attach(undefined);
  }, [mine, face, ready, inspector]);
  useEffect(() => {
    if (ready && kind !== undefined && id !== undefined) face.touch({ kind, id } as RecordRef);
  }, [face, ready, kind, id]);
  if (mine === undefined) return null;
  return <StarKey mine={face} selected={() => currentOf(inspector.ui.inspector.getState())} />;
}
