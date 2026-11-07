/** A dialog body loaded on first open (step 8.4a): a Skeleton meanwhile, the service's message and Retry on failure. */
import type { ComponentType } from 'react';
import type { ChunkCache } from '@/app/services/lazy-chunk';
import { Button, Dialog, Skeleton } from '@/ui/primitives';
import { useChunk } from './lazy-view';

export function LazyDialogView<P extends object>(props: { readonly cache: ChunkCache<ComponentType<P>>; readonly title: string; readonly viewProps: P; readonly onClose: () => void }) {
  const { answer, retry } = useChunk(props.cache);
  if (answer?.ok === true) {
    const Loaded = answer.value;
    return <Loaded {...props.viewProps} />;
  }
  return (
    <Dialog open onClose={props.onClose} title={props.title} dismissOnBackdrop>
      {answer === undefined ? <Skeleton label={`Loading ${props.title.toLowerCase()}`} lines={3} /> : <div role="alert"><p>{answer.message}</p><Button onClick={retry}>Retry</Button></div>}
    </Dialog>
  );
}
