import { createChunkCache } from '@/app/services/lazy-chunk';
import { LazyDialogView } from './lazy-dialog-view';
import type { StatusDialogs, StatusDialogsProps } from './status-dialogs';

const chunk = createChunkCache<typeof StatusDialogs>(() => import('./status-dialogs').then((m) => m.StatusDialogs), 'The status details');

export function LazyStatusDialogs(props: StatusDialogsProps) {
  return <LazyDialogView cache={chunk} title={props.kind === 'layout' ? 'Layout notes' : 'Status'} viewProps={props} onClose={props.onClose} />;
}
