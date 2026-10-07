/** The first-run screen (UI_ARCHITECTURE §12): shown while the store holds zero records and "Start empty" was not chosen. */
import { useRef } from 'react';
import { useSubscribable } from '@/ui/hooks';
import { Button, Skeleton } from '@/ui/primitives';
import { useApp } from './context';
import type { ImportFlow } from './use-import-flow';

export function FirstRun(props: { readonly flow: ImportFlow; readonly onStartEmpty: () => void }) {
  const { services } = useApp();
  const status = useSubscribable(services.status);
  const { flow } = props;
  const picker = useRef<HTMLInputElement>(null);
  const writable = status.mode === 'writer' || status.mode === 'session_only';
  const waiting = status.stage === 'booting' || status.mode === null;
  return (
    <section aria-label="First run">
      <h2>Get started</h2>
      <p>This dataset has no records yet.</p>
      {waiting ? (
        <Skeleton label="Starting up" lines={2} />
      ) : !writable ? (
        <p>This tab is read-only, so it cannot load data. Use the writer tab.</p>
      ) : (
        <>
          <p>
            <Button variant="primary" disabled={flow.busy} onClick={flow.loadDemo}>
              Load demo dataset
            </Button>{' '}
            <Button disabled={flow.busy} onClick={() => picker.current?.click()}>
              Import a file
            </Button>{' '}
            <Button disabled={flow.busy} onClick={props.onStartEmpty}>
              Start empty
            </Button>
          </p>
          <input
            ref={picker}
            type="file"
            hidden
            aria-label="Choose a file to import"
            accept=".json,.orn,.ornpkg,.zip,application/json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file !== undefined) flow.chooseFile(file);
            }}
          />
        </>
      )}
    </section>
  );
}
