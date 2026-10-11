/**
 * What the merged result would be checked against, quarantined records, and the blockers with an "Exclude" choice per record. The
 * findings are the preview's (errors first, at most `IMPORT_PREVIEW_MAX_FINDINGS`) with the full count beside them; every text is
 * the engine's plain message, rendered as text.
 */
import { IMPORT_PREVIEW_MAX_FINDINGS, type ImportPlan } from '@/io/contracts';
import type { Finding } from '@/core/validation/contracts';
import type { RecordRef } from '@/core/schema';
import { Button } from '@/ui/primitives';
import { ListBox } from './list-box';
import type { PlanChange } from './plan-request';
import { shownMessage, shownName } from './words';
import styles from './import.module.css';

const SEVERITY: Readonly<Record<string, { readonly word: string; readonly className: string }>> = {
  error: { word: 'Error', className: styles.error ?? '' },
  warning: { word: 'Warning', className: styles.warning ?? '' },
  info: { word: 'Info', className: '' },
  review_required: { word: 'Review', className: styles.review ?? '' },
};

const refText = (ref: RecordRef): string => `${ref.kind.replaceAll('_', ' ')} ${ref.id}`;

export function BlockedSection(props: { readonly plan: ImportPlan }) {
  const { blockers, canConfirm } = props.plan.preview;
  if (canConfirm && blockers.length === 0) return null;
  return (
    <section className={styles.section} aria-label="Blocked">
      <h3 className={styles.error}>This import cannot be applied yet</h3>
      <ul className={styles.counts} aria-label="Blockers">
        {blockers.map((blocker) => (
          <li key={blocker}>{blocker}</li>
        ))}
      </ul>
      <p className={styles.muted}>Fix the file, or leave out the records that have errors with the Exclude choice in the list below. Confirm stays unavailable until then.</p>
    </section>
  );
}

export function ExcludedSection(props: { readonly plan: ImportPlan; readonly busy: boolean; readonly onChange: (change: PlanChange) => void }) {
  const { excluded } = props.plan;
  if (excluded.length === 0) return null;
  return (
    <section className={styles.section} aria-label="Left out">
      <h3>Left out of the import ({excluded.length})</h3>
      <ListBox
        label="Records left out"
        items={excluded}
        itemKey={refText}
        render={(ref) => (
          <div className={styles.row}>
            <span className={styles.rowText}>{refText(ref)}</span>
            <Button disabled={props.busy} onClick={() => props.onChange({ type: 'include', ref })}>
              Include again
            </Button>
          </div>
        )}
      />
    </section>
  );
}

export function QuarantineSection(props: { readonly plan: ImportPlan }) {
  const { quarantined } = props.plan.preview;
  if (quarantined.length === 0) return null;
  return (
    <section className={styles.section} aria-label="Set aside">
      <h3 className={styles.warning}>Set aside, not imported ({quarantined.length})</h3>
      <p className={styles.muted}>These entries failed validation (or repeat an ID that is already in the file). They are listed here and kept in the import report; nothing is dropped silently.</p>
      <ListBox
        label="Records set aside"
        items={quarantined}
        itemKey={(item, index) => `${item.claimedKind ?? '?'}:${item.claimedId ?? '?'}:${index}`}
        rowHeight={52}
        render={(item) => (
          <div className={styles.row}>
            <span className={styles.rowText}>
              <span className={styles.word}>{shownName(`${item.claimedKind ?? 'unknown kind'} ${item.claimedId ?? 'without an ID'}`)}</span>: {item.issues.map(shownMessage).join('; ')}
            </span>
          </div>
        )}
      />
    </section>
  );
}

export function FindingsSection(props: { readonly plan: ImportPlan; readonly busy: boolean; readonly onChange: (change: PlanChange) => void }) {
  const { findings, findingSummary: s } = props.plan.preview;
  const total = s.error + s.warning + s.info + s.reviewRequired;
  return (
    <section className={styles.section} aria-label="Findings of the result">
      <h3>Checks on the merged result</h3>
      <p>
        {s.error} errors, {s.warning} warnings, {s.info} notes, {s.reviewRequired} to review ({total} in all).
        {s.truncated ? ` The list shows the first ${Math.min(findings.length, IMPORT_PREVIEW_MAX_FINDINGS).toLocaleString('en-US')}, errors first; the counts are complete.` : ''}
      </p>
      {findings.length === 0 ? (
        <p className={styles.muted}>No findings.</p>
      ) : (
        <ListBox
          label="Findings"
          items={findings}
          itemKey={(finding: Finding) => finding.id}
          rowHeight={52}
          render={(finding: Finding) => {
            const severity = SEVERITY[finding.severity] ?? { word: finding.severity, className: '' };
            return (
              <div className={styles.row}>
                <span className={styles.rowText}>
                  <span className={`${styles.word} ${severity.className}`}>{severity.word}</span> {finding.ruleId} on {refText(finding.subject)}
                  {finding.path === undefined ? '' : ` (${finding.path})`}: {shownMessage(finding.message)}
                </span>
                {finding.severity === 'error' ? (
                  <Button disabled={props.busy} onClick={() => props.onChange({ type: 'exclude', ref: finding.subject })} aria-label={`Exclude ${refText(finding.subject)}`}>
                    Exclude
                  </Button>
                ) : null}
              </div>
            );
          }}
        />
      )}
    </section>
  );
}
