/**
 * Step 5.11b: the record puts of ONE write transaction, made as slices of requests. The transaction stays one (INV-20, INV-21): the
 * slices only let the writer say how far it has got. Every slice's `bulkPut` is ISSUED at once, in order, as the single
 * `bulkPut` of all the rows did, and a progress report `{ written, total }` is made as each slice's writes succeed (in order, before
 * the transaction commits). A failing slice rejects the whole group and the error leaves the transaction, which commits nothing.
 *
 * Why not wait for each slice before issuing the next (PROGRESS 5.11b part 1, measured): that made the Chromium apply of the
 * 16.9 MB design file 16% slower for any first slice under about 1,000 puts (1,667 -> 1,925 ms), because the waits change when
 * the main thread's other work runs; and a size that is fast there (2,048) would be 30 s between reports in WebKit, which costs
 * about 15 ms per put request (PROGRESS 5.10b part 2W). Issued at once, the slice size only sets how often progress is heard:
 * 32 puts is about half a second in WebKit and a millisecond elsewhere.
 */
import type { AnyRecord } from '@/core/schema';
import type { WriteProgress } from './contracts';

export const WRITE_SLICE_SIZE = 32;

export interface SliceTable {
  bulkPut(rows: AnyRecord[]): Promise<unknown>;
}

export async function putInSlices(table: SliceTable, rows: readonly AnyRecord[], report: (progress: WriteProgress) => void): Promise<void> {
  let written = 0;
  const slices: Promise<void>[] = [];
  for (let from = 0; from < rows.length; from += WRITE_SLICE_SIZE) {
    const slice = rows.slice(from, from + WRITE_SLICE_SIZE);
    slices.push(
      table.bulkPut(slice).then(() => {
        written += slice.length;
        report({ written, total: rows.length });
      }),
    );
  }
  await Promise.all(slices);
}

/** A listener set whose members can never break a write: a throwing listener is dropped from this call only. */
export function createProgressListeners(): { add(listener: (progress: WriteProgress) => void): () => void; report(progress: WriteProgress): void } {
  const listeners = new Set<(progress: WriteProgress) => void>();
  return {
    add(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    report(progress) {
      for (const listener of [...listeners]) {
        try {
          listener(progress);
        } catch {
          // progress is only a display; it never fails a write
        }
      }
    },
  };
}
