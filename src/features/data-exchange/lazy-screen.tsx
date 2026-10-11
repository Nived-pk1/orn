/**
 * The import screen is its own chunk (step 5.9a; the initial load stays small). It is loaded when the first import opens. A load that
 * fails is a value shown in words with a Retry button, never a blank window; a screen that throws is caught by the error boundary.
 */
import { useCallback, useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { Button, Dialog, ErrorBoundary, Skeleton } from '@/ui/primitives';
import type { DataExchangePorts } from './contracts';
import type { ImportModel } from './import-model';
import type { ImportScreen as ImportScreenType } from './import-screen';

type Screen = typeof ImportScreenType;
export type ScreenLoad = { readonly ok: true; readonly ImportScreen: Screen } | { readonly ok: false; readonly message: string };

let loaded: Screen | undefined;
let pending: Promise<ScreenLoad> | undefined;

/** Loads the chunk once; a failure is not remembered, so Retry asks again. */
export function loadImportScreen(): Promise<ScreenLoad> {
  if (loaded !== undefined) return Promise.resolve({ ok: true, ImportScreen: loaded });
  pending ??= import('./import-screen').then(
    (module): ScreenLoad => {
      loaded = module.ImportScreen;
      return { ok: true, ImportScreen: module.ImportScreen };
    },
    (error: unknown): ScreenLoad => ({
      ok: false,
      message: `The import screen could not be loaded (${error instanceof Error ? error.message : String(error)}). Check the connection and press Retry; if it keeps failing, reload the page. Nothing was changed.`,
    }),
  );
  return pending.then((answer) => {
    if (!answer.ok) pending = undefined;
    return answer;
  });
}

function Loader(props: { readonly model: ImportModel; readonly ports: Pick<DataExchangePorts, 'nameOf'>; readonly open: boolean }) {
  const [answer, setAnswer] = useState<ScreenLoad | undefined>(loaded === undefined ? undefined : { ok: true, ImportScreen: loaded });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (answer?.ok === true) return;
    let live = true;
    void loadImportScreen().then((next) => {
      if (live) setAnswer(next);
    });
    return () => {
      live = false;
    };
  }, [attempt, answer?.ok]);
  const retry = useCallback(() => {
    setAnswer(undefined);
    setAttempt((n) => n + 1);
  }, []);
  if (answer?.ok === true) return <answer.ImportScreen model={props.model} ports={props.ports} />;
  return (
    <Dialog open={props.open} onClose={props.model.cancel} title="Import a file" footer={answer === undefined ? undefined : <Button onClick={retry}>Retry</Button>}>
      {answer === undefined ? <Skeleton label="Loading the import screen" lines={3} /> : <p role="alert">{answer.message}</p>}
    </Dialog>
  );
}

/** Mounts the lazy screen when an import is open (or has been); before the first one nothing is loaded. */
export function LazyImportScreen(props: { readonly model: ImportModel; readonly ports: Pick<DataExchangePorts, 'nameOf'> }) {
  const open = useStore(props.model.store, (state) => state.phase !== 'closed');
  const [everOpened, setEverOpened] = useState(open);
  useEffect(() => {
    if (open) setEverOpened(true);
  }, [open]);
  if (!open && !everOpened) return null;
  return (
    <ErrorBoundary label="The import screen">
      <Loader model={props.model} ports={props.ports} open={open} />
    </ErrorBoundary>
  );
}
