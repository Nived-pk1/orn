/**
 * The inspector's views for every kind are their own chunk (step 5.7, lazy loading; the four substance and reaction views joined in
 * step 6.1a, `views-other.tsx`). The chunk is loaded when a record is first opened. A load that fails is a value (`ViewsLoad`), shown
 * in words with a Retry button, never a blank panel; a view that throws while rendering is caught by the panel's error boundary.
 */
import type { Finding } from '@/core/validation';
import { useCallback, useEffect, useState } from 'react';
import type { AnyRecord } from '@/core/schema';
import { ErrorBoundary, Skeleton } from '@/ui/primitives';
import type { OtherView as OtherViewValue } from './views-other';
import styles from './inspector.module.css';

type OtherView = typeof OtherViewValue;

export type ViewsLoad = { readonly ok: true; readonly OtherView: OtherView } | { readonly ok: false; readonly message: string };

let loaded: OtherView | undefined;
let pending: Promise<ViewsLoad> | undefined;

/** Loads the chunk once; a failure is not remembered, so Retry asks again. */
export function loadOtherViews(): Promise<ViewsLoad> {
  if (loaded !== undefined) return Promise.resolve({ ok: true, OtherView: loaded });
  pending ??= import('./views-other').then(
    (module): ViewsLoad => {
      loaded = module.OtherView;
      return { ok: true, OtherView: module.OtherView };
    },
    (error: unknown): ViewsLoad => ({
      ok: false,
      message: `This kind of record could not be shown because part of the app did not load (${error instanceof Error ? error.message : String(error)}). Check the connection and press Retry.`,
    }),
  );
  return pending.then((answer) => {
    if (!answer.ok) pending = undefined;
    return answer;
  });
}

function Loader(props: { readonly record: AnyRecord; readonly findings: readonly Finding[] }) {
  const [answer, setAnswer] = useState<ViewsLoad | undefined>(loaded === undefined ? undefined : { ok: true, OtherView: loaded });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (answer?.ok === true) return;
    let live = true;
    void loadOtherViews().then((next) => {
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
  if (answer === undefined) return <Skeleton label="Loading this view" lines={4} />;
  if (!answer.ok) {
    return (
      <div role="alert" className={styles.muted}>
        <p>{answer.message}</p>
        <button type="button" onClick={retry}>
          Retry
        </button>
      </div>
    );
  }
  return <answer.OtherView record={props.record} findings={props.findings} />;
}

export function LazyOtherView(props: { readonly record: AnyRecord; readonly findings: readonly Finding[] }) {
  return (
    <ErrorBoundary label="This view">
      <Loader record={props.record} findings={props.findings} />
    </ErrorBoundary>
  );
}
