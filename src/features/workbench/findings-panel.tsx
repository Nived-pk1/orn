/**
 * The findings panel beside the form (ADR-040): the live L1 findings of the draft, or the findings a refused Save returned (L2-L3 ERRORs).
 * A finding whose path is a field of the form is a button that moves the focus to that field. Text nodes only; the message is the core's.
 */
import type { Finding } from '@/core/validation';
import styles from './editor.module.css';

/** The element of the form that has `path`, or the nearest one above it ("names.aliases[2]" -> "names.aliases" -> "names"); null when none. */
export function fieldFor(root: ParentNode, path: string | undefined): HTMLElement | null {
  if (path === undefined || path === '*') return null;
  const fields = Array.from(root.querySelectorAll<HTMLElement>('[data-field-path]'));
  let current = path;
  for (let guard = 0; guard < 16 && current !== ''; guard += 1) {
    const exact = fields.find((field) => field.dataset.fieldPath === current);
    if (exact !== undefined) return exact;
    const parent = current.replace(/(\[\d+\]|\.[^.[]+)$/, '');
    if (parent === current) break;
    current = parent;
  }
  return fields.find((field) => (field.dataset.fieldPath ?? '').startsWith(`${current}.`) || field.dataset.fieldPath === current) ?? null;
}

export const findingLine = (finding: Finding): string => `${finding.message}${finding.path === undefined ? '' : ` (${finding.path})`}`;

export function FindingsPanel(props: {
  readonly heading: string;
  readonly findings: readonly Finding[];
  /** True when the form has a field for this path (the finding is then a button). */
  readonly inForm: (path: string | undefined) => boolean;
  readonly onFocusField: (path: string | undefined) => void;
  readonly emptyText: string;
  /** Status lines under the findings ("Checking the structure...", a worker that is down, what is checked at Save). */
  readonly notes?: readonly { readonly id: string; readonly text: string }[];
}) {
  const { findings } = props;
  const notes = props.notes ?? [];
  return (
    <section className={styles.panel} aria-label="Findings">
      <h3>{props.heading}</h3>
      {findings.length === 0 && !notes.some((note) => note.id.startsWith('checking')) ? (
        <p className={styles.hint}>{props.emptyText}</p>
      ) : (
        <ul className={styles.findings}>
          {findings.map((finding) => {
            const word = finding.severity === 'error' ? 'Error' : finding.severity === 'warning' ? 'Warning' : finding.severity === 'info' ? 'Note' : 'Review';
            const body = (
              <>
                <span className={`${styles.severity} ${finding.severity === 'error' ? styles.severityError : ''}`}>{word}</span> {findingLine(finding)}
              </>
            );
            return (
              <li key={finding.id}>
                {props.inForm(finding.path) ? (
                  <button type="button" onClick={() => props.onFocusField(finding.path)}>
                    {body}
                  </button>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
      {notes.length === 0 ? null : (
        <ul className={styles.notes} aria-label="Checks">
          {notes.map((note) => (
            <li key={note.id} className={styles.hint}>
              {note.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
