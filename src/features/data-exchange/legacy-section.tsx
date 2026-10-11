/**
 * The legacy report of a v6 / v4 file (MIGRATION.md section 4): what was created, the per-hub decision (class by default, or species)
 * as a choice, every item that needs review, what belongs to the document and not to a record, and anything not imported (expected
 * zero, and said so in words when it is). All of it is the report's own data; nothing is worked out here.
 */
import type { LegacyImportReport } from '@/io';
import { ListBox } from './list-box';
import { shownMessage } from './words';
import styles from './import.module.css';

const sum = (record: Readonly<Record<string, number>>): number => Object.values(record).reduce((total, n) => total + n, 0);
const kindText = (kind: string): string => kind.replaceAll('_', ' ');

function valueText(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? 'undefined';
  return shownMessage(text);
}

export function LegacySection(props: { readonly report: LegacyImportReport }) {
  const { report } = props;
  const created = Object.entries(report.createdCounts).filter(([, n]) => (n ?? 0) > 0);
  const unmapped = Object.entries(report.documentUnmapped);
  return (
    <section className={styles.section} aria-label="Legacy report">
      <h3>From the older app ({report.sourceSystem}, version {report.sourceSchemaVersion})</h3>
      <p>
        {created.length === 0 ? 'No records were created.' : `Created: ${created.map(([kind, n]) => `${n} ${kindText(kind)}`).join(', ')}.`}
      </p>

      <h4>Needs your review ({report.reviewItems.length})</h4>
      {report.reviewItems.length === 0 ? (
        <p className={styles.muted}>Nothing needs review.</p>
      ) : (
        <ListBox
          label="Review items"
          items={report.reviewItems}
          itemKey={(item, index) => `${item.subject.kind}:${item.subject.id}:${index}`}
          rowHeight={48}
          render={(item) => (
            <div className={styles.row}>
              <span className={styles.rowText}>
                <span className={styles.word}>{kindText(item.subject.kind)} {item.subject.id}</span>: {shownMessage(item.reason)}
              </span>
            </div>
          )}
        />
      )}

      <h4>Not imported ({report.notImported.length})</h4>
      {report.notImported.length === 0 ? (
        <p>Nothing was left out: every value of the file was either imported or kept with its record.</p>
      ) : (
        <ListBox
          label="Not imported"
          items={report.notImported}
          itemKey={(item, index) => `${item.legacyId}:${index}`}
          rowHeight={48}
          render={(item) => (
            <div className={styles.row}>
              <span className={styles.rowText}>
                <span className={styles.word}>{shownMessage(item.legacyId)}</span>: {shownMessage(item.reason)}
              </span>
            </div>
          )}
        />
      )}

      <h4>Kept with the document, not with a record ({unmapped.length})</h4>
      {unmapped.length === 0 ? (
        <p className={styles.muted}>None: no value belongs to the document itself.</p>
      ) : (
        <ListBox
          label="Document values"
          items={unmapped}
          itemKey={([key]) => key}
          rowHeight={48}
          render={([key, value]) => (
            <div className={styles.row}>
              <span className={styles.rowText}>
                <span className={styles.word}>{shownMessage(key)}</span>: {valueText(value)}
              </span>
            </div>
          )}
        />
      )}

      <p className={styles.muted}>
        Kept as provenance on their records: {sum(report.preservedUnmappedFields)} older values in {Object.keys(report.preservedUnmappedFields).length} fields; {sum(report.consumedByDefault)} empty
        values replaced by defaults; {report.reagentFamilies.length} reagent families; {report.collisions.length} ID collisions settled; {report.unsafeKeysRenamed.length} unsafe keys renamed.
      </p>
    </section>
  );
}
