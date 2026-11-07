/** The notice band as a lazy chunk (step 8.4a size trim): it loads right after the first paint; until then the band row is empty. */
import { createChunkCache } from '@/app/services/lazy-chunk';
import { LazyInline } from './lazy-view';
import type { NoticeBand } from './notice-band';

const chunk = createChunkCache<typeof NoticeBand>(() => import('./notice-band').then((m) => m.NoticeBand), 'The notices');

export const prefetchNoticeBand = (): Promise<unknown> => chunk.get();

export function LazyNoticeBand() {
  return <LazyInline cache={chunk} viewProps={{}} />;
}
