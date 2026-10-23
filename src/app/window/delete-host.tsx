/**
 * The delete dialog where it opens (step 6.8a, D1; several records at once for the map's bulk Delete, step 6.8b): computes the impact from the CURRENT state and indexes (core `deleteView`), shows it, and
 * on Delete dispatches ONE envelope (`deleteEnvelope`), so one Undo restores everything. A refusal of the store is said in words and nothing
 * changes. Loaded with `React.lazy` by `editors.tsx`, so none of it is in the entry chunk. No chemistry.
 */
import { useMemo, useState } from 'react';
import { deleteEnvelope, deleteView } from '@/core/editing';
import type { RecordRef } from '@/core/schema';
import { DeleteDialog } from '@/features/workbench/layer';
import { useToasts } from '@/ui/primitives';
import { useApp } from './context';

export function DeleteHost(props: { readonly targets: readonly RecordRef[]; /** Why deleting is unavailable in this tab (read-only); undefined when it is available. */ readonly reason: string | undefined; readonly onClose: () => void }) {
  const { services, inspector } = useApp();
  const toasts = useToasts();
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const { targets, onClose } = props;
  const view = useMemo(() => deleteView(services.store.getState(), inspector.indexes.current(), targets), [services, inspector, targets]);
  const run = (): void => {
    setBusy(true);
    const built = deleteEnvelope(services.store.getState(), targets);
    const result = services.store.dispatch(built);
    setBusy(false);
    if (!result.ok) {
      setMessage(`The delete was refused: ${result.error.message}`);
      return;
    }
    toasts.push({ kind: 'info', text: view.targets.length > 1 ? `Deleted ${view.targets.length} records. Undo brings them back.` : `Deleted ${view.targets[0]?.name ?? 'the record'}. Undo brings it back.` });
    onClose();
  };
  const open = (ref: RecordRef): void => {
    inspector.ui.inspector.getState().open(ref);
    inspector.ui.panels.getState().setInspectorOpen(true);
  };
  return <DeleteDialog view={view} reason={props.reason} message={message} busy={busy} onDelete={run} onOpen={open} onClose={onClose} />;
}
