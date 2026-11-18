/** The `MyRecords` face of the lazy holder (step 8.4g Part B, size trim), read by the lazy views only (Starred, the Chapters strip, Settings, the late keys): empty until the rules are loaded. */
import { useEffect } from 'react';
import type { RecordRef } from '@/core/schema';
import type { LazyMine } from './my-records-lazy';
import type { MyRecords } from './my-records';

const NONE: readonly RecordRef[] = [];
const faces = new WeakMap<LazyMine, MyRecords>();

/** No stars, nothing recent, nothing written (a window without the services, a test). */
export const NO_MY_RECORDS: MyRecords = { starred: () => NONE, isStarred: () => false, toggle: () => 'full', recent: () => NONE, touch: () => undefined, clearRecent: () => undefined, subscribe: () => () => undefined };

export function faceOf(mine: LazyMine): MyRecords {
  let face = faces.get(mine);
  if (face === undefined) {
    face = {
      starred: () => mine.records()?.starred() ?? NONE,
      isStarred: (ref) => mine.records()?.isStarred(ref) ?? false,
      toggle: (ref) => mine.records()?.toggle(ref) ?? 'full',
      recent: () => mine.records()?.recent() ?? NONE,
      touch: (ref) => mine.records()?.touch(ref),
      clearRecent: () => mine.records()?.clearRecent(),
      subscribe: mine.subscribe,
    };
    faces.set(mine, face);
  }
  return face;
}

/** The face for a view: it asks for the load (first use) and is `NO_MY_RECORDS` when the window has no holder. */
export function useFace(mine: LazyMine | undefined): MyRecords {
  useEffect(() => {
    void mine?.load();
  }, [mine]);
  return mine === undefined ? NO_MY_RECORDS : faceOf(mine);
}
