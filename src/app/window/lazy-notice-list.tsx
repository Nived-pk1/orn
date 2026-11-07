/** The notice list as a lazy chunk (step 8.4a). */
import { createChunkCache } from '@/app/services/lazy-chunk';
import { LazyDialogView } from './lazy-dialog-view';
import type { BandNotice } from './notice-band-view';
import type { NoticeList } from './notice-list';

const listChunk = createChunkCache<typeof NoticeList>(() => import('./notice-list').then((m) => m.NoticeList), 'The notice list');

export function LazyNoticeList(props: { readonly notices: readonly BandNotice[]; readonly onClose: () => void }) {
  return <LazyDialogView cache={listChunk} title="Notices" viewProps={props} onClose={props.onClose} />;
}
