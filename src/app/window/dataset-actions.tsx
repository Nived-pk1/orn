/**
 * Dataset mode actions (5.5d follow-up): "Replace with the demo dataset" imports the bundled demo with replace_all through the normal
 * pipeline (note E7) after a confirm that says the data is replaced and Undo import brings it back (the `pre_import` snapshot);
 * "Undo import" restores that snapshot. Read-only, follower and session-only tabs get the buttons `unavailable` with the reason.
 */
import { useState } from 'react';
import { useSubscribable } from '@/ui/hooks';
import { Button, Dialog } from '@/ui/primitives';
import { useApp } from './context';
import type { ImportFlow } from './use-import-flow';

export function unavailableReason(mode: string | null, reason: string | null): string | undefined {
  if (mode === 'writer') return undefined;
  if (mode === null) return 'the app is still starting';
  if (mode === 'session_only') return 'nothing is saved in this session, so there is no snapshot to undo to';
  return reason ?? (mode === 'follower' ? 'another tab is the writer' : 'this tab is read-only');
}

export function DatasetActions(props: { readonly flow: ImportFlow }) {
  const { services } = useApp();
  const status = useSubscribable(services.status);
  const { flow } = props;
  const [asking, setAsking] = useState(false);
  const blocked = unavailableReason(status.mode, status.reason) ?? (flow.busy ? 'another operation is running' : undefined);
  return (
    <section aria-label="Replace the data">
      <h3>Replace the data</h3>
      <p>
        <Button {...(blocked === undefined ? { onClick: () => setAsking(true) } : { unavailable: blocked })}>Replace with the demo dataset</Button>{' '}
        <Button {...(blocked === undefined ? { onClick: flow.undoImport } : { unavailable: blocked })}>Undo import</Button>
      </p>
      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        title="Replace with the demo dataset"
        footer={
          <>
            <Button onClick={() => setAsking(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                setAsking(false);
                flow.loadDemo();
              }}
            >
              Replace
            </Button>
          </>
        }
      >
        <p>The current data is replaced by the bundled demo dataset. Undo import brings the current data back (a snapshot is taken first).</p>
      </Dialog>
    </section>
  );
}
