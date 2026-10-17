/**
 * The command palette as a lazy chunk (step 6.1a; the palette and cmdk were 9 kB gzip of the entry chunk). Nothing loads while the
 * palette is closed and not yet asked for; `prefetchPalette` (called once the first view is drawn, when the browser is idle) fetches it
 * so the first Ctrl/Cmd+K and the phone Search tab open as before. If it is still loading when asked, the Search dialog shows the
 * Skeleton (never a blank panel); a chunk that fails to load says so in words with Retry (the lazy-chunk service's message).
 */
import { useEffect, useState } from 'react';
import { createChunkCache, type ChunkCache, type ChunkLoad } from '@/app/services/lazy-chunk';
import type { SearchPorts } from '@/features/search';
import type { Palette } from '@/features/search/palette';
import { useLayoutMode } from '@/ui/hooks';
import { Button, Dialog, Skeleton } from '@/ui/primitives';

type PaletteComponent = typeof Palette;

const paletteChunk = createChunkCache<PaletteComponent>(() => import('@/features/search/layer').then((m) => m.Palette), 'The search');

/** Starts loading the palette chunk; the answer is a value (a failure is shown when the palette is opened, not here). */
export function prefetchPalette(chunk: ChunkCache<PaletteComponent> = paletteChunk): Promise<ChunkLoad<PaletteComponent>> {
  return chunk.get();
}

export function LazyPalette(props: { readonly ports: SearchPorts; readonly open: boolean; readonly onClose: () => void; readonly chunk?: ChunkCache<PaletteComponent> }) {
  const { ports, open, onClose } = props;
  const chunk = props.chunk ?? paletteChunk;
  const phone = useLayoutMode() === 'phone';
  const [answer, setAnswer] = useState<ChunkLoad<PaletteComponent> | undefined>(() => {
    const value = chunk.peek();
    return value === undefined ? undefined : { ok: true, value };
  });
  const [attempt, setAttempt] = useState(0);
  const loaded = answer?.ok === true;
  useEffect(() => {
    if (!open || loaded) return;
    let live = true;
    void chunk.get().then((next) => {
      if (live) setAnswer(next);
    });
    return () => {
      live = false;
    };
  }, [open, loaded, chunk, attempt]);
  // a prefetch that finished while the palette was closed
  useEffect(() => {
    if (loaded) return;
    const value = chunk.peek();
    if (value !== undefined) setAnswer({ ok: true, value });
  }, [open, loaded, chunk]);

  if (answer?.ok === true) {
    const Loaded = answer.value;
    return <Loaded ports={ports} open={open} onClose={onClose} />;
  }
  if (!open) return null;
  return (
    <Dialog open onClose={onClose} title="Search" dismissOnBackdrop size={phone ? 'screen' : 'default'}>
      {answer === undefined ? (
        <Skeleton label="Loading search" lines={4} />
      ) : (
        <div role="alert">
          <p>{answer.message}</p>
          <Button
            onClick={() => {
              setAnswer(undefined);
              setAttempt((n) => n + 1);
            }}
          >
            Retry
          </Button>
        </div>
      )}
    </Dialog>
  );
}
