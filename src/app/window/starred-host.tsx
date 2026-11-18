/** The Starred view on the canvas (step 8.4g Part B, G2): its own lazy chunk in BOTH editions; the window's records and stars are handed to the view, once the stars are read (the empty words are never said before that). */
import { useSyncExternalStore } from 'react';
import { useStoreSelector } from '@/ui/hooks';
import type { RecordRef } from '@/core/schema';
import { useApp } from './context';
import { useFace } from './my-records-face';
import { StarredView } from './starred-view';

const NEVER = (): (() => void) => () => undefined;

export function StarredHost(props: { readonly onOpen: (ref: RecordRef, title: string) => void }) {
  const { services, mine } = useApp();
  const state = useStoreSelector(services.store, (s) => s);
  const face = useFace(mine);
  const loaded = useSyncExternalStore(mine?.subscribe ?? NEVER, () => mine === undefined || mine.records() !== undefined);
  return loaded ? <StarredView state={state} mine={face} onOpen={props.onOpen} /> : null;
}
