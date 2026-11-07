/**
 * Lazy chunks for the window (step 8.4a size trim): `useChunk` loads a chunk (a value, never an exception: a failure is the service's message
 * with Retry), `LazyDialogView` is a dialog body loaded on first open (a Skeleton meanwhile), `LazyInline` is something in the page.
 */
import { useEffect, useState, type ComponentType } from 'react';
import type { ChunkCache, ChunkLoad } from '@/app/services/lazy-chunk';
import { Button } from '@/ui/primitives';

export function useChunk<P>(cache: ChunkCache<ComponentType<P>>): { readonly answer: ChunkLoad<ComponentType<P>> | undefined; readonly retry: () => void } {
  const [answer, setAnswer] = useState<ChunkLoad<ComponentType<P>> | undefined>(() => {
    const value = cache.peek();
    return value === undefined ? undefined : { ok: true, value };
  });
  const [attempt, setAttempt] = useState(0);
  const loaded = answer?.ok === true;
  useEffect(() => {
    if (loaded) return;
    let live = true;
    void cache.get().then((next) => {
      if (live) setAnswer(next);
    });
    return () => {
      live = false;
    };
  }, [loaded, attempt, cache]);
  return { answer, retry: () => { setAnswer(undefined); setAttempt((n) => n + 1); } };
}

export function LazyInline<P extends object>(props: { readonly cache: ChunkCache<ComponentType<P>>; readonly viewProps: P }) {
  const { answer, retry } = useChunk(props.cache);
  if (answer?.ok === true) {
    const Loaded = answer.value;
    return <Loaded {...props.viewProps} />;
  }
  if (answer === undefined) return null;
  return <p role="alert">{answer.message} <Button onClick={retry}>Retry</Button></p>;
}
