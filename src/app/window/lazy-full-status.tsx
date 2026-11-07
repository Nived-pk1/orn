/** The full status line as a lazy chunk (Studio only; Study never asks for it). `prefetchFullStatus` lets tests and boot have it ready. */
import { createChunkCache } from '@/app/services/lazy-chunk';
import { LazyInline } from './lazy-view';
import type { FullStatusLine } from './full-status';

const chunk = createChunkCache<typeof FullStatusLine>(() => import('./full-status').then((m) => m.FullStatusLine), 'The status bar');

export const prefetchFullStatus = (): Promise<unknown> => chunk.get();

export function LazyFullStatus() {
  return <LazyInline cache={chunk} viewProps={{}} />;
}
