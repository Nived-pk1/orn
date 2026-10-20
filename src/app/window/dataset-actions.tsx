/**
 * Dataset mode actions (5.5d follow-up): "Replace with the demo dataset" imports the bundled demo with replace_all through the normal
 * pipeline (note E7) after a confirm that says the data is replaced and Undo import brings it back (the `pre_import` snapshot);
 * "Undo import" restores that snapshot. Read-only and follower tabs get the buttons `unavailable` with the reason; a session-only tab
 * cannot replace but CAN undo an import (its snapshots are kept in memory).
 */
import { useSubscribable } from '@/ui/hooks';
import { Button, Dialog } from '@/ui/primitives';
import { useApp } from './context';
import { datasetWordsOf, useDatasetInfo } from './dataset-info';
import type { ExportActions } from './use-export-actions';
import type { ImportActions } from './use-import-actions';

export function unavailableReason(mode: string | null, reason: string | null): string | undefined {
  if (mode === 'writer') return undefined;
  if (mode === null) return 'the app is still starting';
  if (mode === 'session_only') return 'nothing is saved in this session, so there is no snapshot to undo to';
  return reason ?? (mode === 'follower' ? 'another tab is the writer' : 'this tab is read-only');
}

/** Undo import in every tab that can write: a session-only tab keeps its snapshots in memory (at most 3, step 5.1c), so it can undo too (5.9a review, item 5). */
export const undoUnavailableReason = (mode: string | null, reason: string | null): string | undefined => (mode === 'session_only' ? undefined : unavailableReason(mode, reason));

/** The confirm step of "Replace with the demo dataset": rendered once by the window, so the palette command and the button share it. */
export function ReplaceDialog(props: { readonly open: boolean; readonly onClose: () => void; readonly imports: ImportActions }) {
  const words = datasetWordsOf(useDatasetInfo());
  const { imports, onClose } = props;
  return (
    <Dialog
      open={props.open}
      onClose={onClose}
      title={words.replaceTitle}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              onClose();
              imports.loadDemo();
            }}
          >
            Replace
          </Button>
        </>
      }
    >
      <p>{words.replaceBody}</p>
    </Dialog>
  );
}

export function DatasetActions(props: { readonly imports: ImportActions; readonly exports: ExportActions; readonly onAskReplace: () => void }) {
  const { services } = useApp();
  const status = useSubscribable(services.status);
  const { imports } = props;
  const words = datasetWordsOf(useDatasetInfo());
  const busy = imports.busy ? 'another operation is running' : undefined;
  const blocked = unavailableReason(status.mode, status.reason) ?? busy;
  const undoBlocked = undoUnavailableReason(status.mode, status.reason) ?? busy;
  return (
    <>
    <section aria-label="Back up the data">
      <h3>Back up the data</h3>
      <p>
        <Button onClick={props.exports.open}>Export...</Button>
      </p>
    </section>
    <section aria-label="Replace the data">
      <h3>Replace the data</h3>
      <p>
        <Button {...(blocked === undefined ? { onClick: props.onAskReplace } : { unavailable: blocked })}>{words.replaceTitle}</Button>{' '}
        <Button {...(undoBlocked === undefined ? { onClick: imports.undoImport } : { unavailable: undoBlocked })}>Undo import</Button>
      </p>
    </section>
    </>
  );
}
