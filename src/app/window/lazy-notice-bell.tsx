/** The notices bell as a lazy chunk (step 8.4d): until it loads, the same bell shows, saying why it cannot be opened yet, so the bar does not shift. */
import { createChunkCache } from '@/app/services/lazy-chunk';
import { LazyInline, useChunk } from './lazy-view';
import { NoticeBellButton } from './notice-bell-button';
import type { NoticeBell } from './notice-bell';

const chunk = createChunkCache<typeof NoticeBell>(() => import('./notice-bell').then((m) => m.NoticeBell), 'The notices');

export const prefetchNoticeBell = (): Promise<unknown> => chunk.get();

export function LazyNoticeBell() {
  const { answer } = useChunk(chunk);
  if (answer === undefined) return <NoticeBellButton count={0} onOpen={() => undefined} unavailable="the notices are loading" />;
  return <LazyInline cache={chunk} viewProps={{}} />;
}
