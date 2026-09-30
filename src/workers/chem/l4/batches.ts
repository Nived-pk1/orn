/**
 * Sending items to the worker in batches. A batch that runs into the per-call limit terminates the worker and says nothing about
 * WHICH item hung, so its items are sent one at a time (a bounded cost: the batch size, one restart per hanging item); an item
 * that times out alone is the culprit. A batch the worker could not answer any other way (down, crashed twice) fails every item
 * with `unavailable`. An answer with the wrong number of results is refused as `unavailable` (a protocol bug is never guessed at).
 */
import type { ToolkitIdentity } from '@/chem/checks/contracts';
import type { CheckCall } from '../client';

export type Settled<I, R> =
  | { readonly item: I; readonly ok: true; readonly result: R }
  | { readonly item: I; readonly ok: false; readonly reason: 'timeout' | 'unavailable'; readonly error: string };

export function chunks<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export async function runBatches<I, R, A extends { readonly toolkit: ToolkitIdentity }>(
  items: readonly I[],
  size: number,
  call: (chunk: readonly I[]) => Promise<CheckCall<A>>,
  resultsOf: (answer: A) => readonly R[],
  onToolkit: (toolkit: ToolkitIdentity) => void,
): Promise<Settled<I, R>[]> {
  const out: Settled<I, R>[] = [];
  const failAll = (chunk: readonly I[], reason: 'timeout' | 'unavailable', error: string): void => {
    for (const item of chunk) out.push({ item, ok: false, reason, error });
  };
  for (const chunk of chunks(items, size)) {
    const answer = await call(chunk);
    if (answer.ok) {
      onToolkit(answer.value.toolkit);
      const results = resultsOf(answer.value);
      if (results.length !== chunk.length) failAll(chunk, 'unavailable', `the worker answered ${results.length} results for ${chunk.length} items`);
      else chunk.forEach((item, i) => out.push({ item, ok: true, result: results[i] as R }));
    } else if (answer.reason === 'timeout' && chunk.length > 1) {
      for (const item of chunk) out.push(...(await runBatches([item], 1, call, resultsOf, onToolkit)));
    } else failAll(chunk, answer.reason, answer.error);
  }
  return out;
}
