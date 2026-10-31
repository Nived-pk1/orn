/**
 * The Review page where it opens (step 6.8b, R1): the port of the review queue made from the store, the finding store, the injected clock
 * and the editors. Loaded with `React.lazy` by the window, only in Studio, so none of it is in the entry chunk or in the Study build.
 * No chemistry: it hands the feature the store's state, the findings and a way to dispatch ONE envelope.
 */
import { useEffect, useMemo, useState } from 'react';
import { groupByOf, type GroupBy, type ImportLine } from '@/core/editing';
import { ReviewPage, type ReviewPort } from '@/features/review/layer';
import { useApp } from './context';
import { useEditors } from './drafts-ui';
import { createLocalTimeFormatter } from './local-time';

const machineTime = createLocalTimeFormatter();

export function createReviewPort(args: {
  readonly store: ReturnType<typeof useApp>['services']['store'];
  readonly nowMs: (() => number) | undefined;
  readonly open: ReviewPort['open'];
  readonly editors: ReturnType<typeof useEditors>;
  /** The saved "Group by" choice and how to keep one (7.3a E1); absent: no grouping port (the bulk dialogs need none). */
  readonly grouping?: { readonly stored: unknown; save(value: { readonly groupBy: GroupBy }): void };
  /** The import journal, newest first, and the local-time formatter (7.3b A1). */
  readonly imports?: { readonly log: readonly ImportLine[]; formatTime(iso: string): string };
}): ReviewPort {
  const { store, nowMs, editors } = args;
  const editable = new Set([...(editors?.fullEditorKinds ?? []), ...(editors?.namesKinds ?? [])]);
  return {
    state: () => store.getState(),
    findingsOf: (ref) => store.findings.bySubject(ref),
    subscribe: (listener) => {
      const offStore = store.subscribe(listener);
      const offFindings = store.findings.subscribe(listener);
      return () => {
        offStore();
        offFindings();
      };
    },
    now: () => new Date(nowMs?.() ?? 0).toISOString(),
    dispatch: (envelope) => {
      const result = store.dispatch(envelope);
      return result.ok ? { ok: true } : { ok: false, message: result.error.message };
    },
    unavailable: editors === null ? 'Editing is not available here.' : editors.editReason,
    open: args.open,
    editReason: (ref) => (editors === null ? 'Editing is not available here.' : editable.has(ref.kind) ? undefined : `${ref.kind.replace(/_/g, ' ')} has no editor of its own yet; use Open in the inspector.`),
    edit: (ref) => editors?.editNames(ref),
    ...(args.imports === undefined ? {} : { imports: args.imports }),
    ...(args.grouping === undefined ? {} : { grouping: { initial: groupByOf(args.grouping.stored), save: (value: GroupBy) => args.grouping?.save({ groupBy: value }) } }),
  };
}

export function ReviewHost() {
  const { services, inspector, nowMs } = useApp();
  const { reviewUi } = useApp();
  const editors = useEditors();
  const { formatTime: injected } = useApp();
  const [log, setLog] = useState<readonly ImportLine[]>([]);
  useEffect(() => {
    let live = true;
    void services.flows.importLog().then((lines) => live && setLog(lines));
    return () => {
      live = false;
    };
  }, [services]);
  const port = useMemo(
    () =>
      createReviewPort({
        store: services.store,
        nowMs,
        editors,
        imports: { log, formatTime: injected ?? machineTime },
        ...(reviewUi === undefined ? {} : { grouping: { stored: reviewUi.stored, save: (value: { readonly groupBy: GroupBy }) => reviewUi.save(value) } }),
        open: (ref) => {
          inspector.ui.inspector.getState().open(ref);
          inspector.ui.panels.getState().setInspectorOpen(true);
        },
      }),
    [services, inspector, nowMs, editors, reviewUi, log, injected],
  );
  return <ReviewPage port={port} />;
}
