/**
 * The preview in words (step 5.9a): what the file is, what it would do, every decision it holds. Everything here is read from the
 * plan; a choice calls `onChange`, which the model turns into a revise of the full request. The sections are separate components.
 */
import type { ImportPlan } from '@/io';
import type { DataExchangePorts, EarlierImportInfo } from './contracts';
import { ConflictsSection } from './conflicts-section';
import { DecisionsSection } from './decisions-section';
import { BlockedSection, ExcludedSection, FindingsSection, QuarantineSection } from './findings-section';
import { LegacySection } from './legacy-section';
import type { PlanChange } from './plan-request';
import { totalsOf } from './plan-request';
import { formatWords, modeWords, shownMessage, shownName } from './words';
import styles from './import.module.css';

const kindText = (kind: string): string => kind.replaceAll('_', ' ');

function Mode(props: { readonly plan: ImportPlan; readonly busy: boolean; readonly onChange: (change: PlanChange) => void }) {
  const { plan, busy } = props;
  return (
    <fieldset className={styles.section} disabled={busy}>
      <legend>How to bring it in</legend>
      {(['merge', 'replace_all'] as const).map((mode) => (
        <label key={mode} className={styles.choice}>
          <input type="radio" name="import-mode" checked={plan.mode === mode} onChange={() => props.onChange({ type: 'mode', mode })} />
          <span>
            <span className={styles.word}>{mode === 'merge' ? 'Merge' : 'Replace all'}</span>
            {' — '}
            {modeWords(mode)}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function Extras(props: { readonly plan: ImportPlan }) {
  const p = props.plan.preview;
  const lines: string[] = [];
  if (p.assets.toStore > 0) lines.push(`${p.assets.toStore} asset files will be stored with their records.`);
  if (p.assets.withoutBytes > 0) lines.push(`${p.assets.withoutBytes} asset records come without their file (a check will report them).`);
  if (p.assets.notStored > 0) lines.push(`${p.assets.notStored} asset files are not stored because their records are not written.`);
  for (const rejected of p.rejectedAssets) lines.push(`An asset file was rejected: ${shownMessage(rejected.reason)}`);
  for (const issue of p.packageIssues) lines.push(`Package entry ${shownMessage(issue.path)}: ${shownMessage(issue.reason)}`);
  if (p.kindMismatches.length > 0) lines.push(`${p.kindMismatches.length} records were listed under another kind than their own; they import under their own kind.`);
  if (p.unsafeKeysRenamed.length > 0) lines.push(`${p.unsafeKeysRenamed.length} unsafe keys in the file were renamed (they are listed in the import report).`);
  if (p.richTextLinksRewritten > 0) lines.push(`${p.richTextLinksRewritten} links in texts were rewritten to point at copies.`);
  if (p.migrationsApplied.length > 0) lines.push(`The file was brought up to date first: ${p.migrationsApplied.join(', ')}.`);
  if (lines.length === 0) return null;
  return (
    <section className={styles.section} aria-label="Also in this file">
      <h3>Also in this file</h3>
      <ul className={styles.counts}>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

export function PreviewBody(props: {
  readonly plan: ImportPlan;
  readonly fileName: string;
  readonly earlier: EarlierImportInfo | undefined;
  readonly note: string | undefined;
  readonly busy: boolean;
  readonly ports: Pick<DataExchangePorts, 'nameOf'>;
  readonly onChange: (change: PlanChange) => void;
}) {
  const { plan, busy } = props;
  const p = plan.preview;
  const totals = totalsOf(plan);
  const kinds = Object.entries(p.counts).filter(([, c]) => c !== undefined && c.incoming > 0);
  const schema = p.format === 'legacy_v6' || p.format === 'legacy_v4' ? 'older app format' : `data format version ${p.detectedSchemaVersion}`;
  return (
    <div className={styles.body} aria-busy={busy}>
      <p className={styles.file} title={props.fileName}>
        <span className={styles.word}>{shownName(props.fileName)}</span>
      </p>
      <p>
        Format: {formatWords(p.format)} ({schema}). {totals.incoming} records in the file; {totals.written} would be written; the result holds {p.mergedRecordCount} records.
      </p>
      {props.earlier === undefined ? null : (
        <p className={styles.section}>
          This file was imported before (as {shownName(props.earlier.fileName)}, {props.earlier.appliedAt}); identical records are skipped.
        </p>
      )}
      {props.note === undefined ? null : (
        <p className={styles.note} role="status">
          {props.note}
        </p>
      )}
      <Mode plan={plan} busy={busy} onChange={props.onChange} />
      <section className={styles.section} aria-label="Counts">
        <h3>Records per kind</h3>
        <ul className={styles.counts} aria-label="Records per kind">
          {kinds.map(([kind, c]) => (
            <li key={kind}>
              {kindText(kind)}: {c?.incoming} in the file — {c?.new} new, {c?.identical} identical, {c?.conflicting} conflicting
            </li>
          ))}
        </ul>
        {kinds.length === 0 ? <p className={styles.muted}>The file holds no valid records.</p> : null}
      </section>
      <BlockedSection plan={plan} />
      <DecisionsSection plan={plan} busy={busy} onChange={props.onChange} />
      {p.legacyReport === undefined ? null : <LegacySection report={p.legacyReport} />}
      <ConflictsSection plan={plan} ports={props.ports} busy={busy} onChange={props.onChange} />
      <QuarantineSection plan={plan} />
      <ExcludedSection plan={plan} busy={busy} onChange={props.onChange} />
      <FindingsSection plan={plan} busy={busy} onChange={props.onChange} />
      <Extras plan={plan} />
    </div>
  );
}
