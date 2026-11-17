/** The window's address (step 8.4g, G1): the host the address module needs, made from what the window already has. */
import { useMemo, useRef } from 'react';
import { PAGE_VIEWS } from '@/ui/state';
import { nameOfRecord } from '@/features/inspector';
import type { AnyRecord } from '@/core/schema';
import { useApp } from './context';
import type { AddressHost } from './address-state';
import { showRecord } from './show-record';
import { useAddress, type LostAddress } from './use-address';

export function useWindowAddress(args: {
  readonly mode: string;
  readonly setMode: (mode: string) => void;
  readonly ready: boolean;
  readonly views: readonly { readonly id: string }[];
  readonly open: AddressHost['open'];
  readonly openPane: () => void;
  readonly lost: LostAddress;
  readonly setLost: (lost: LostAddress) => void;
}): void {
  const app = useApp();
  const { mode, ready } = args;
  // the window's callbacks change with its renders; the host is made once and reads the latest
  const latest = useRef(args);
  latest.current = args;
  const host = useMemo<AddressHost>(() => {
    const recordOf = (kind: string, id: string): AnyRecord | undefined => (app.services.store.getState().records as Readonly<Record<string, Readonly<Record<string, AnyRecord>>>>)[kind]?.[id];
    return {
      ui: app.navigator.ui,
      inspector: app.inspector.ui.inspector,
      has: (kind, id) => recordOf(kind, id) !== undefined,
      get views() {
        return latest.current.views.map((view) => view.id);
      },
      setMode: (next) => latest.current.setMode(next),
      open: Object.fromEntries(PAGE_VIEWS.map((view) => [view, (id: string) => latest.current.open[view]?.(id)])),
      show: (ref) => {
        const record = recordOf(ref.kind, ref.id);
        showRecord(app, latest.current.setMode, latest.current.openPane, ref, record === undefined ? '' : nameOfRecord(record));
      },
    };
  }, [app]);
  useAddress(host, mode, ready, args.lost, args.setLost);
}
