/**
 * The way into the address code (step 8.4g, G1): only this small gate is in the entry. The code (parse and format, the hook, the carrying out
 * of an address) is a lazy chunk, fetched at once when the URL has an address, as soon as the reader first changes view, or when the browser
 * is idle, whichever comes first. Draws nothing.
 */
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { AddressDriver } from './address-driver';

let loading: Promise<{ default: typeof AddressDriver }> | undefined;
const fetchDriver = (): Promise<{ default: typeof AddressDriver }> => (loading ??= import('./address-driver').then((m) => ({ default: m.AddressDriver })));
const Driver = lazy(fetchDriver);
/** Fetches the chunk now (a window test that resets its module registry loads it in its own registry first). */
export const prefetchAddressDriver = (): Promise<unknown> => fetchDriver();

export function AddressGate(props: Omit<Parameters<typeof AddressDriver>[0], 'fromBoot'>) {
  const [armed, setArmed] = useState(false);
  const first = useRef<string | undefined>(undefined);
  const fromBoot = useRef(false);
  const { ready, mode } = props;
  useEffect(() => {
    if (armed || !ready) return undefined;
    first.current ??= mode;
    // the first address of the visit is written NOW, by replacing (no new entry), so a quick first click already has an entry to go Back to
    const brought = location.hash.length > 1 && !fromBoot.current; // an address the reader came with
    if (!brought && !fromBoot.current) {
      history.replaceState(history.state, '', `#/${mode === 'navigator' ? 'map' : mode}`);
      fromBoot.current = true;
    }
    if (brought || mode !== first.current) {
      setArmed(true);
      return undefined;
    }
    const idle = (window as { requestIdleCallback?: (run: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
    const handle = idle === undefined ? window.setTimeout(() => setArmed(true), 1500) : idle(() => setArmed(true), { timeout: 2000 });
    return () => (idle === undefined ? window.clearTimeout(handle) : (window as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(handle));
  }, [armed, ready, mode]);
  return armed ? (
    <Suspense fallback={null}>
      <Driver {...props} fromBoot={fromBoot.current} />
    </Suspense>
  ) : null;
}
