/**
 * The inspector's views for every kind are their own chunk (step 5.7, lazy loading; the four substance and reaction views joined in
 * step 6.1a, `views-other.tsx`). The chunk is loaded when a record is first opened. A load that fails is a value (`ViewsLoad`), shown
 * in words with a Retry button, never a blank panel; a view that throws while rendering is caught by the panel's error boundary.
 */
import type { Finding } from '@/core/validation';
import { useCallback, useEffect, useState } from 'react';
import type { AnyRecord } from '@/core/schema';
import { ErrorBoundary, Skeleton } from '@/ui/primitives';
import type { OtherView as OtherViewValue, StudyInspector as StudyInspectorValue } from './views-other';
import type { StudyInspectorProps } from './study-inspector';
import styles from './inspector.module.css';

type OtherView = typeof OtherViewValue;
type StudyView = typeof StudyInspectorValue;

export type ViewsLoad = { readonly ok: true; readonly OtherView: OtherView; readonly StudyInspector: StudyView } | { readonly ok: false; readonly message: string };

let loaded: { readonly OtherView: OtherView; readonly StudyInspector: StudyView } | undefined;
let pending: Promise<ViewsLoad> | undefined;

/** Loads the chunk once; a failure is not remembered, so Retry asks again. */
export function loadOtherViews(): Promise<ViewsLoad> {
  if (loaded !== undefined) return Promise.resolve({ ok: true, ...loaded });
  pending ??= import('./views-other').then(
    (module): ViewsLoad => {
      loaded = { OtherView: module.OtherView, StudyInspector: module.StudyInspector };
      return { ok: true, ...loaded };
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
  const [answer, setAnswer] = useState<ViewsLoad | undefined>(loaded === undefined ? undefined : { ok: true, ...loaded });
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

function StudyLoader(props: StudyInspectorProps) {
  const [answer, setAnswer] = useState<ViewsLoad | undefined>(loaded === undefined ? undefined : { ok: true, ...loaded });
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
  if (answer === undefined) return <Skeleton label="Loading this record" lines={4} />;
  if (!answer.ok) {
    return (
      <div role="alert" className={styles.muted}>
        <p>{answer.message}</p>
        <button type="button" onClick={() => { setAnswer(undefined); setAttempt((n) => n + 1); }}>
          Retry
        </button>
      </div>
    );
  }
  return <answer.StudyInspector {...props} />;
}

/** The new inspector layout (step 8.1) from the views chunk, so it is not in the first paint. */
export function LazyStudyInspector(props: StudyInspectorProps) {
  return (
    <ErrorBoundary label="This record">
      <StudyLoader {...props} />
    </ErrorBoundary>
  );
}
