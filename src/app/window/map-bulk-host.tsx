/**
 * The map's bulk actions in Studio (step 6.8b, R2): provides `MapBulkContext` to the navigator (which then has a multi-selection at all)
 * and opens the right dialog for "Mark verified (n)" and "Delete (n)". This file is small on purpose - it is in the entry chunk - and the
 * dialogs are a lazy chunk (`map-bulk-dialogs.tsx`). Studio only: the Study window never mounts it, so the map has no multi-selection.
 */
import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import type { RecordRef } from '@/core/schema';
import { loadMultiEngine, MapBulkContext, useMultiSelect, warmMultiEngine, type MapBulk } from '@/features/navigator';
import { useEditors } from './drafts-ui';

// /* @__PURE__ */: an unused lazy() is dropped with its import() in Study, where nothing mounts the provider
const MapBulkDialogs = /* @__PURE__ */ lazy(() => import('./map-bulk-dialogs').then((m) => ({ default: m.MapBulkDialogs })));

type Pending = { readonly type: 'verify' | 'delete'; readonly refs: readonly RecordRef[] };

export function MapBulkProvider(props: { readonly children: ReactNode; /** The engine's loader (step 6.8b, Y1); a test injects its own. */ readonly load?: MapBulk['load'] }) {
  const load = props.load ?? loadMultiEngine;
  const editors = useEditors();
  const [pending, setPending] = useState<Pending | null>(null);
  const reason = editors === null ? 'Editing is not available here.' : editors.editReason;
  const value = useMemo<MapBulk>(
    () => ({
      unavailable: reason,
      markVerified: (ids) => setPending({ type: 'verify', refs: ids.map((id) => ({ kind: 'reaction', id }) as RecordRef) }),
      remove: (ids) => setPending({ type: 'delete', refs: ids.map((id) => ({ kind: 'reaction', id }) as RecordRef) }),
      useMulti: useMultiSelect,
      load,
      loaded: warmMultiEngine,
    }),
    [reason, load],
  );
  return (
    <MapBulkContext.Provider value={value}>
      {props.children}
      {pending === null ? null : (
        <Suspense fallback={null}>
          <MapBulkDialogs action={pending.type} refs={pending.refs} reason={reason} onClose={() => setPending(null)} />
        </Suspense>
      )}
    </MapBulkContext.Provider>
  );
}
