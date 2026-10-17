/**
 * The conflict view (ADR-040), shown when Save answers `conflict`: "This record was changed since you started" and a table of the fields
 * that differ (field | when you started | now | your draft). Where both sides changed a field the user chooses "Keep mine" or "Take now"
 * (no default: Save stays unavailable until each is chosen); a field only the stored record changed is kept as stored, a field only the
 * draft changed keeps the draft: all of them are listed, nothing is silent. Values are bounded plain text, never HTML.
 */
import type { ConflictChoice, ConflictChoices, FieldComparison } from '@/core/editing';
import { Button } from '@/ui/primitives';
import styles from './editor.module.css';

export const MAX_VALUE_CHARS = 200;

/** A value as bounded plain text: "(not set)" for an absent one; a long one is cut with the full length said. */
export function valueText(value: unknown): string {
  if (value === undefined) return '(not set)';
  const text = typeof value === 'string' ? (value === '' ? '(empty text)' : value) : (JSON.stringify(value) ?? String(value));
  return text.length <= MAX_VALUE_CHARS ? text : `${text.slice(0, MAX_VALUE_CHARS)}... (cut: ${text.length} characters in all)`;
}

/** A path as words when no section labels it: "names.common[2]" is "names, common, 2". */
export function fieldWords(path: string): string {
  return path.split(/[^A-Za-z0-9]+/).filter((word) => word !== '').join(', ');
}

const WHAT: Readonly<Record<string, string>> = {
  theirsOnly: 'Kept as it is now (you did not change it)',
  mineOnly: 'Your draft is kept (nobody else changed it)',
};

export function ConflictView(props: {
  readonly comparisons: readonly FieldComparison[];
  readonly choices: ConflictChoices;
  readonly onChoose: (path: string, choice: ConflictChoice) => void;
  readonly onSave: () => void;
  readonly onBack: () => void;
  readonly saving: boolean;
  /** The label the section that owns a field gives it; undefined: the path's words are shown. */
  readonly labelOf?: (path: string) => string | undefined;
}) {
  const labelFor = (path: string): string => props.labelOf?.(path) ?? fieldWords(path);
  const rows = props.comparisons.filter((field) => field.status !== 'same');
  const open = rows.filter((field) => field.status === 'both' && props.choices[field.path] === undefined).length;
  return (
    <section aria-label="Conflict" className={styles.section}>
      <h3>This record was changed since you started</h3>
      <p className={styles.hint}>Your draft is kept. Look at the fields below, choose for each one that both of you changed, then save.</p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">When you started</th>
              <th scope="col">Now</th>
              <th scope="col">Your draft</th>
              <th scope="col">What happens</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((field) => (
              <tr key={field.path}>
                <th scope="row">{labelFor(field.path)}</th>
                <td>{valueText(field.base)}</td>
                <td>{valueText(field.theirs)}</td>
                <td>{valueText(field.mine)}</td>
                <td>
                  {field.status === 'both' ? (
                    <div className={styles.choices} role="group" aria-label={`Choice for ${labelFor(field.path)}`}>
                      <Button className={props.choices[field.path] === 'mine' ? styles.chosen : ''} aria-pressed={props.choices[field.path] === 'mine'} onClick={() => props.onChoose(field.path, 'mine')}>
                        Keep mine
                      </Button>
                      <Button className={props.choices[field.path] === 'theirs' ? styles.chosen : ''} aria-pressed={props.choices[field.path] === 'theirs'} onClick={() => props.onChoose(field.path, 'theirs')}>
                        Take now
                      </Button>
                    </div>
                  ) : (
                    (WHAT[field.status] ?? '')
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.confirm}>
        <Button
          variant="primary"
          {...(props.saving ? { unavailable: 'saving' } : open > 0 ? { unavailable: `choose Keep mine or Take now for ${open === 1 ? 'the field' : `each of the ${open} fields`} that both of you changed` } : { onClick: props.onSave })}
        >
          Save with these choices
        </Button>
        <Button onClick={props.onBack}>Back to the draft</Button>
      </p>
    </section>
  );
}

/** The target was deleted: the draft cannot be saved as an edit. */
export function DeletedView(props: { readonly onBack: () => void; readonly onDiscard: () => void }) {
  return (
    <section aria-label="Deleted record" className={styles.section}>
      <h3>This record was deleted since you started</h3>
      <p>This record was deleted since you started; the draft cannot be saved as an edit.</p>
      <p className={styles.confirm}>
        <Button onClick={props.onDiscard}>Discard draft</Button>
        <Button onClick={props.onBack}>Back</Button>
      </p>
    </section>
  );
}
