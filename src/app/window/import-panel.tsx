/**
 * What the import flow shows (step 5.1d): working text with Cancel, the plain summary of a file (counts per kind, blockers, the
 * decisions at their defaults as text) with Confirm or Cancel, a refusal with its offer (merge, or the in-page path), the result.
 */
import type { ImportPlan } from '@/io';
import type { ImportFlow } from './use-import-flow';

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

export function ImportPanel(props: { readonly flow: ImportFlow }) {
  const { flow } = props;
  const view = flow.view;
  switch (view.phase) {
    case 'idle':
      return null;
    case 'working':
      return (
        <section aria-label="Import" role="status">
          <p>{view.text}…</p>
          {view.cancellable ? (
            <button type="button" onClick={flow.cancel}>
              Cancel
            </button>
          ) : null}
        </section>
      );
    case 'summary':
      return (
        <section aria-label="Import">
          <h2>Import summary</h2>
          <PlanSummary plan={view.plan} fileName={view.fileName} />
          <button type="button" disabled={!view.plan.preview.canConfirm} onClick={flow.confirm}>
            Confirm
          </button>{' '}
          <button type="button" onClick={flow.cancel}>
            Cancel
          </button>
        </section>
      );
    case 'message':
      return (
        <section aria-label="Import" role="alert">
          <p>{view.text}</p>
          {view.offer === undefined ? null : (
            <button type="button" onClick={flow.acceptOffer}>
              {view.offer === 'merge' ? 'Merge instead' : 'Run on this page'}
            </button>
          )}{' '}
          <button type="button" onClick={flow.dismiss}>
            Dismiss
          </button>
        </section>
      );
    case 'done':
      return (
        <section aria-label="Import" role="status">
          <p>{view.text}</p>
          {view.notes.length > 0 ? (
            <ul>
              {view.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
          <button type="button" onClick={flow.dismiss}>
            Dismiss
          </button>
        </section>
      );
  }
}
