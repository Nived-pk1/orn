/** The first-run screen (UI_ARCHITECTURE §12): shown while the store holds zero records and "Start empty" was not chosen. */
import { useSubscribable } from '@/ui/hooks';
import { Button, Skeleton } from '@/ui/primitives';
import { useAboutOpen } from './about-preview';
import { useApp } from './context';
import type { ImportActions } from './use-import-actions';

export function FirstRun(props: { readonly imports: ImportActions; readonly onStartEmpty: () => void }) {
  const { services } = useApp();
  const status = useSubscribable(services.status);
  const { imports } = props;
  const about = useAboutOpen() ?? (() => undefined);
  const writable = status.mode === 'writer' || status.mode === 'session_only';
  const waiting = status.stage === 'booting' || status.mode === null;
  return (
    <section aria-label="First run">
      <h2>Get started</h2>
      <p>
        Preview - the chemistry is a demo and not yet checked.{' '}
        <Button variant="quiet" onClick={about}>
          About this preview
        </Button>
      </p>
      <p>This dataset has no records yet.</p>
      {waiting ? (
        <Skeleton label="Starting up" lines={2} />
      ) : !writable ? (
        <p>This tab is read-only, so it cannot load data. Use the writer tab.</p>
      ) : (
        <>
          <p>
            <Button variant="primary" disabled={imports.busy} onClick={imports.loadDemo}>
              Load demo dataset
            </Button>{' '}
            <Button disabled={imports.busy} onClick={imports.pick}>
              Import a file
            </Button>{' '}
            <Button disabled={imports.busy} onClick={imports.pick}>
              Import v6 export
            </Button>{' '}
            <Button disabled={imports.busy} onClick={props.onStartEmpty}>
              Start empty
            </Button>
          </p>
          <p>You can also drop a file anywhere on this window. The older app&apos;s export (v6) is read by the same screen, which shows what it found before anything changes.</p>
        </>
      )}
    </section>
  );
}
