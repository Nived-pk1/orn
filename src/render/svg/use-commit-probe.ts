/** Tells a probe that a layer committed (the render counters of the tests; step 5.4a). A layer that React skips never calls it. */
import { useEffect } from 'react';
import type { LayerName } from './contracts';

export function useCommitProbe(layer: LayerName, probe: ((layer: LayerName) => void) | undefined): void {
  useEffect(() => {
    probe?.(layer);
  });
}
