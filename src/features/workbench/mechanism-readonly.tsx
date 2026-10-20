/**
 * What the mechanism editor does not edit yet (step 6.5a decision D2), shown as short read-only lines and kept unchanged by Save: mechanism
 * classes, concepts, study notes, notes, tags and citations (step 6.6). Counts and excerpts only; the draft is never changed here.
 */
import styles from './editor.module.css';

type Fields = Record<string, unknown>;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const excerpt = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || value === '') return undefined;
  return value.length > 240 ? `${value.slice(0, 239)}... (${value.length.toLocaleString('en-US')} characters)` : value;
};

export function MechanismReadOnlySection(props: { readonly draft: unknown }) {
  const fields = (typeof props.draft === 'object' && props.draft !== null ? props.draft : {}) as Fields;
  const texts: readonly (readonly [string, string | undefined])[] = [
    ['Study notes', excerpt(fields.studyNotes)],
    ['Notes', excerpt(fields.notes)],
  ];
  return (
    <div>
      <p className={styles.hint}>Editing arrives in step 6.6. These are kept unchanged when you save.</p>
      <p>
        Mechanism classes: {list(fields.mechanismClasses).length}. Concepts: {list(fields.conceptIds).length}. Tags: {list(fields.tags).length}. Citations: {list(fields.citations).length}.
      </p>
      {texts.map(([label, value]) => (value === undefined ? null : <p key={label}>{label}: {value}</p>))}
    </div>
  );
}
