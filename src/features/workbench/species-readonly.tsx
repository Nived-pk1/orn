/**
 * Properties, notes, tags and citations of a species (step 6.2a decision D2): shown, not edited. "Editing arrives in step 6.6." The
 * draft keeps them exactly as they are, so a Save never loses them.
 */
import styles from './editor.module.css';

type Fields = Record<string, unknown>;

const excerpt = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || value === '') return undefined;
  return value.length > 240 ? `${value.slice(0, 239)}... (${value.length.toLocaleString('en-US')} characters)` : value;
};

export function ReadOnlySection(props: { readonly draft: unknown }) {
  const fields = (typeof props.draft === 'object' && props.draft !== null ? props.draft : {}) as Fields;
  const properties = Array.isArray(fields.properties) ? (fields.properties as { key?: unknown; value?: unknown }[]) : [];
  const tags = Array.isArray(fields.tags) ? fields.tags.length : 0;
  const citations = Array.isArray(fields.citations) ? fields.citations.length : 0;
  const texts: readonly (readonly [string, string | undefined])[] = [
    ['Notes', excerpt(fields.notes)],
    ['Study notes', excerpt(fields.studyNotes)],
    ['Acid-base notes', excerpt(fields.acidBaseNotes)],
  ];
  return (
    <div>
      <p className={styles.hint}>Editing arrives in step 6.6. These are kept unchanged when you save.</p>
      <h4>Properties ({properties.length})</h4>
      {properties.length === 0 ? (
        <p className={styles.hint}>None.</p>
      ) : (
        <ul>
          {properties.map((property, index) => (
            <li key={index}>
              {String(property.key ?? '').replace(/_/g, ' ')}: {String(property.value ?? '')}
            </li>
          ))}
        </ul>
      )}
      {texts.map(([label, text]) => (text === undefined ? null : <p key={label}>{label}: {text}</p>))}
      <p className={styles.hint}>
        Tags: {tags}. Citations: {citations}.
      </p>
    </div>
  );
}
