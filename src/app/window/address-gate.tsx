/**
 * The way into the address code (step 8.4g, G1): only this small gate is in the entry. The code (parse and format, the hook, the carrying out
 * of an address) is a lazy chunk, fetched at once when the URL has an address, as soon as the reader first changes view, or when the browser
 * is idle, whichever comes first. Draws nothing.
 */
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { AddressDriver } from './address-driver';

const Driver = lazy(() => import('./address-driver').then((m) => ({ default: m.AddressDriver })));

export function AddressGate(props: Parameters<typeof AddressDriver>[0]) {
  const [armed, setArmed] = useState(false);
  const first = useRef<string | undefined>(undefined);
  const { ready, mode } = props;
  useEffect(() => {
    if (armed || !ready) return undefined;
    first.current ??= mode;
    if (location.hash.length > 1 || mode !== first.current) {
      setArmed(true);
      return undefined;
    }
    const idle = (window as { requestIdleCallback?: (run: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
    const handle = idle === undefined ? window.setTimeout(() => setArmed(true), 1500) : idle(() => setArmed(true), { timeout: 2000 });
    return () => (idle === undefined ? window.clearTimeout(handle) : (window as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(handle));
  }, [armed, ready, mode]);
  return armed ? (
    <Suspense fallback={null}>
      <Driver {...props} />
    </Suspense>
  ) : null;
}
