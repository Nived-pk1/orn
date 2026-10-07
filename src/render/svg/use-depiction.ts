/** The status of one depiction as a React value (step 5.4a): subscribes to the key, asks for it while it is wanted. */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { DepictionSource, DepictionStatus } from './contracts';

const NOTHING: DepictionStatus = { state: 'idle' };
const nobody = (): (() => void) => () => undefined;

/** `key` undefined (not wanted at this LOD, or the node has none) answers idle and asks for nothing. */
export function useDepiction(source: DepictionSource | undefined, key: string | undefined): DepictionStatus {
  const subscribe = useCallback((listener: () => void) => (source === undefined || key === undefined ? nobody() : source.subscribe(key, listener)), [source, key]);
  const read = useCallback(() => (source === undefined || key === undefined ? NOTHING : source.snapshot(key)), [source, key]);
  const status = useSyncExternalStore(subscribe, read, read);
  const dropped = status.state === 'idle';
  useEffect(() => {
    if (source !== undefined && key !== undefined) source.request(key);
  }, [source, key, dropped]);
  return status;
}
