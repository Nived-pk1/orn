/**
 * What the import flow shows (steps 5.1d, 5.2): working text with Cancel; the plain summary of a file (counts per kind, blockers, the
 * decisions at their defaults as text) in a DIALOG with Confirm or Cancel (Esc cancels); a refusal with its offer (merge, or the
 * in-page path) as an error banner; the result as a TOAST (a polite live region), which carries the notes with it.
 */
import { useEffect, useRef } from 'react';
import type { ImportPlan } from '@/io';
import { Banner, Button, Dialog, useToasts } from '@/ui/primitives';
import type { ImportFlow, ImportView } from './use-import-flow';

export const RESULT_TOAST_MS = 10_000;

const kindLabel = (kind: string): string => kind.replaceAll('_', ' ');

export function PlanSummary(props: { readonly plan: ImportPlan; readonly fileName: string }) {
  const { plan } = props;
  const preview = plan.preview;
  const kinds = Object.entries(preview.counts).filter(([, c]) => c !== undefined && c.incoming > 0);
  const summary = preview.findingSummary;
  return (
    <>
      <h3>{props.fileName}</h3>
      <p>
        Format {preview.format}; {preview.mergedRecordCount} records in the result; mode {plan.mode === 'replace_all' ? 'replace all (the dataset is empty)' : 'merge'}.
      </p>
      <ul aria-label="Records per kind">
        {kinds.map(([kind, c]) => (
          <li key={kind}>
            {kindLabel(kind)}: {c?.incoming} incoming ({c?.new} new, {c?.identical} identical, {c?.conflicting} conflicting)
          </li>
        ))}
      </ul>
      <p>
        Findings in the result: E {summary.error} / W {summary.warning} / I {summary.info} / Review {summary.reviewRequired}
        {summary.truncated ? ' (the list is cut short; the counts are complete)' : ''}.
      </p>
      {preview.quarantined.length > 0 ? <p>{preview.quarantined.length} records failed validation and are set aside, not imported.</p> : null}
      {preview.migrationsApplied.length > 0 ? <p>Migrations applied to the file: {preview.migrationsApplied.join(', ')}.</p> : null}
      {preview.assets.withoutBytes > 0 ? <p>{preview.assets.withoutBytes} asset records come without their file.</p> : null}
      {preview.rejectedAssets.length > 0 ? <p>{preview.rejectedAssets.length} asset files were rejected.</p> : null}
      {preview.decisions.length > 0 ? (
        <>
          <p>Decisions, left at their defaults:</p>
          <ul aria-label="Decisions">
            {preview.decisions.map((d) => (
              <li key={d.id}>
                {d.question} {d.chosen}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {preview.blockers.length > 0 ? (
        <>
          <p>This file cannot be imported as it is:</p>
          <ul aria-label="Blockers">
            {preview.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

/** The result of an import is announced once as a toast and the flow goes back to idle. A clean, saved result goes away by itself. */
function ImportResult(props: { readonly view: Extract<ImportView, { phase: 'done' }>; readonly flow: ImportFlow }) {
  const toasts = useToasts();
  const shown = useRef<ImportView | null>(null);
  const { view, flow } = props;
  useEffect(() => {
    if (shown.current === view) return;
    shown.current = view;
    const clean = view.notes.length === 0 && view.text.startsWith('Imported');
    toasts.push({ kind: clean ? 'info' : 'warning', text: [view.text, ...view.notes].join(' '), ...(clean ? { autoDismissMs: RESULT_TOAST_MS } : {}) });
    flow.dismiss();
  }, [view, flow, toasts]);
  return null;
}

export function ImportPanel(props: { readonly flow: ImportFlow }) {
  const { flow } = props;
  const view = flow.view;
  return (
    <>
      <Dialog
        open={view.phase === 'summary'}
        onClose={flow.cancel}
        title="Import summary"
        footer={
          <>
            <Button onClick={flow.cancel}>Cancel</Button>
            <Button variant="primary" {...(view.phase === 'summary' && view.plan.preview.canConfirm ? { onClick: flow.confirm } : { unavailable: 'this file cannot be imported as it is' })}>
              Confirm
            </Button>
          </>
        }
      >
        {view.phase === 'summary' ? <PlanSummary plan={view.plan} fileName={view.fileName} /> : null}
      </Dialog>
      {view.phase === 'working' ? (
        <section aria-label="Import" role="status">
          <p>{view.text}…</p>
          {view.cancellable ? <Button onClick={flow.cancel}>Cancel</Button> : null}
        </section>
      ) : null}
      {view.phase === 'message' ? (
        <section aria-label="Import">
          <Banner
            kind="error"
            actions={
              <>
                {view.offer === undefined ? null : <Button onClick={flow.acceptOffer}>{view.offer === 'merge' ? 'Merge instead' : 'Run on this page'}</Button>}
                <Button onClick={flow.dismiss}>Dismiss</Button>
              </>
            }
          >
            {view.text}
          </Banner>
        </section>
      ) : null}
      {view.phase === 'done' ? <ImportResult view={view} flow={flow} /> : null}
    </>
  );
}
