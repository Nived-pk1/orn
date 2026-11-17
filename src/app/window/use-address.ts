/**
 * The address follows the app (step 8.4g, G1; ADR-047). A change of view, of the open page or of the record shown makes ONE history entry;
 * Back, Forward, a reload and a new tab carry the address out. Zoom, pan, hover and typing are not in the address. The first address of a
 * visit replaces the entry instead of adding one. A bad address, or a record this version lacks, is `lost` until the reader goes elsewhere.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatAddress, parseAddress } from '@/ui/state';
import { applyAddress, currentAddress, type AddressHost } from './address-state';

/** An address the app could not show, and the view it was shown on (the window keeps it; the not-found screen reads it). */
export type LostAddress = { readonly what: 'bad' | 'missing'; readonly mode: string } | null;

export function useAddress(host: AddressHost, mode: string, ready: boolean, lost: LostAddress, setLost: (lost: LostAddress) => void): void {
  const [, setTick] = useState(0);
  const [live, setLive] = useState(false);
  const replace = useRef(true);
  const now = useRef(mode);
  now.current = mode;
  const bump = useCallback(() => setTick((n) => n + 1), []);
  const carry = useCallback(() => {
    const done = applyAddress(host, parseAddress(location.hash));
    setLost(done === 'bad' || done === 'missing' ? { what: done, mode: now.current } : null);
    replace.current = true;
    bump();
  }, [host, bump, setLost]);
  useEffect(() => {
    const { ui, inspector } = host;
    const off = [ui.family, ui.chapters, ui.reagents, ui.named, ui.mechanisms, inspector].map((store) => store.subscribe(bump));
    return () => off.forEach((stop) => stop());
  }, [host, bump]);
  useEffect(() => {
    if (!ready || live) return;
    carry();
    setLive(true);
  }, [ready, live, carry]);
  useEffect(() => {
    if (!live) return undefined;
    window.addEventListener('hashchange', carry);
    return () => window.removeEventListener('hashchange', carry);
  }, [live, carry]);
  useEffect(() => {
    if (!live || (lost !== null && lost.mode === mode)) return undefined;
    // the full map keeps a history entry of its own and leaves it with Back: nothing is written until that entry is gone
    if ((history.state as { orn?: string } | null)?.orn === 'full-map') {
      window.addEventListener('popstate', bump, { once: true });
      return () => window.removeEventListener('popstate', bump);
    }
    const want = formatAddress(currentAddress(mode, host));
    if (want !== location.hash) history[replace.current ? 'replaceState' : 'pushState'](null, '', want);
    replace.current = false;
    return undefined;
  });
}
