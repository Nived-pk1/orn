/**
 * Code that is used only on a rare path (the in-process import and export, used when the compute worker is down) is its own chunk
 * and loaded here on first use (step 5.7, lazy loading). A chunk that fails to load is a value with a message in words, never an
 * exception and never a blank result; it is not remembered, so the next call tries again.
 */
export type ChunkLoad<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

export async function loadChunk<T>(load: () => Promise<T>, what: string): Promise<ChunkLoad<T>> {
  try {
    return { ok: true, value: await load() };
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `${what} could not be loaded (${why}). Check the connection and try again, or reload the page; nothing was changed.` };
  }
}
