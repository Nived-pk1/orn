/** The not-found screen as a lazy chunk (step 8.4g, G7): it is fetched only when an address needs it. */
import { createChunkCache } from '@/app/services/lazy-chunk';
import { LazyInline } from './lazy-view';
import type { NotFound } from './not-found';

const chunk = createChunkCache<typeof NotFound>(() => import('./not-found').then((m) => m.NotFound), 'The not-found screen');

export function LazyNotFound(props: { readonly what: 'bad' | 'missing'; readonly onChapters: () => void }) {
  return <LazyInline cache={chunk} viewProps={props} />;
}
