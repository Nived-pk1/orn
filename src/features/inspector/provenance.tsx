/**
 * Level 5, the part every record kind has (step 5.6a): provenance, the legacy trace, the review detail, the findings in full and the raw
 * record as read-only text. The raw record is `JSON.stringify` of the stored record in a `<pre>`: a text child, so every character is
 * escaped by React; nothing in it is ever interpreted. With it, no field of a record is hidden from the user (nothing silent).
 */
import { useState } from 'react';
import type { AnyRecord } from '@/core/schema';
import type { Finding } from '@/core/validation';
import { FactList, Facts } from './levels';
import { RecordLink } from './rich-text';
import { REVIEW_WORD } from './model/findings';
import styles from './inspector.module.css';

type Loose = Readonly<Record<string, unknown>>;

export function FindingsList(props: { readonly findings: readonly Finding[] }) {
  if (props.findings.length === 0) return <p className={styles.muted}>No findings for this record.</p>;
  return (
    <ul className={styles.findings} aria-label="Findings">
      {props.findings.map((finding) => (
        <li key={finding.id}>
          <strong>{finding.ruleId}</strong> ({finding.severity.replaceAll('_', ' ')}, level {finding.level}
          {finding.path === undefined ? '' : `, ${finding.path}`}): {finding.message}
          {finding.related.length === 0 ? null : (
            <>
              {' '}
              Related:{' '}
              {finding.related.map((ref, index) => (
                <span key={`${ref.kind}:${ref.id}`}>
                  {index > 0 ? ', ' : ''}
                  <RecordLink kind={ref.kind} id={ref.id} />
                </span>
              ))}
              .
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

export function RawRecord(props: { readonly record: AnyRecord }) {
  const [shown, setShown] = useState(false);
  return (
    <div>
      <button type="button" aria-expanded={shown} onClick={() => setShown(!shown)}>
        {shown ? 'Hide raw record' : 'Show raw record'}
      </button>
      {shown ? (
        <pre className={styles.raw} aria-label="Raw record">
          {JSON.stringify(props.record, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

export function ProvenanceLevel(props: { readonly record: AnyRecord; readonly findings: readonly Finding[] }) {
  const loose = props.record as unknown as Loose;
  const provenance = loose.provenance as Loose | undefined;
  const review = loose.review as Loose | undefined;
  const legacy = provenance?.legacy as Loose | undefined;
  return (
    <>
      <FactList label="Provenance and review">
        <Facts label="Record ID">{props.record.id}</Facts>
        {provenance === undefined ? null : (
          <>
            <Facts label="Origin">{String(provenance.origin).replaceAll('_', ' ')}</Facts>
            <Facts label="Created">{String(provenance.createdAt)}</Facts>
            <Facts label="Updated">{String(provenance.updatedAt)}</Facts>
            {provenance.importBatchId === undefined ? null : <Facts label="Import batch">{String(provenance.importBatchId)}</Facts>}
          </>
        )}
        {legacy === undefined ? null : (
          <Facts label="Legacy trace">
            {String(legacy.system)}
            {legacy.legacyId === undefined ? '' : `, legacy ID ${String(legacy.legacyId)}`}
            {legacy.unmapped === undefined ? '' : `; unmapped data: ${JSON.stringify(legacy.unmapped)}`}
          </Facts>
        )}
        {review === undefined ? null : (
          <>
            <Facts label="Review">{REVIEW_WORD[String(review.status)] ?? String(review.status)}</Facts>
            <Facts label="Lifecycle">{String(review.lifecycle)}</Facts>
            {review.confidence === undefined ? null : <Facts label="Confidence">{String(review.confidence)}</Facts>}
            {review.reviewedAt === undefined ? null : <Facts label="Reviewed">{String(review.reviewedAt)}</Facts>}
            {Array.isArray(review.reasons) && review.reasons.length > 0 ? (
              <Facts label="Why review is required">
                <ul>
                  {(review.reasons as string[]).map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              </Facts>
            ) : null}
          </>
        )}
      </FactList>
      <h4 className={styles.subheading}>Findings</h4>
      <FindingsList findings={props.findings} />
      <RawRecord record={props.record} />
    </>
  );
}
