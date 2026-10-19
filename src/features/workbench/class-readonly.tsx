/**
 * What the class editor does not edit (step 6.2b decision D1): description, study notes, notes, the R-group note, tags and citations.
 * Shown, never edited: "Editing arrives in step 6.6." The draft keeps them exactly as they are, so a Save never loses them.
 */
import styles from './editor.module.css';

type Fields = Record<string, unknown>;

const excerpt = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || value === '') return undefined;
  return value.length > 240 ? `${value.slice(0, 239)}... (${value.length.toLocaleString('en-US')} characters)` : value;
};

export function ClassReadOnlySection(props: { readonly draft: unknown }) {
  const fields = (typeof props.draft === 'object' && props.draft !== null ? props.draft : {}) as Fields;
  const generic = (typeof fields.generic === 'object' && fields.generic !== null ? fields.generic : {}) as Fields;
  const texts: readonly (readonly [string, string | undefined])[] = [
    ['Description', excerpt(fields.description)],
    ['Study notes', excerpt(fields.studyNotes)],
    ['Notes', excerpt(fields.notes)],
    ['R-group note', excerpt(generic.rGroupNote)],
  ];
  const tags = Array.isArray(fields.tags) ? fields.tags.length : 0;
  const citations = Array.isArray(fields.citations) ? fields.citations.length : 0;
  return (
    <div>
      <p className={styles.hint}>Editing arrives in step 6.6. These are kept unchanged when you save.</p>
      {texts.map(([label, text]) => (text === undefined ? null : <p key={label}>{label}: {text}</p>))}
      <p className={styles.hint}>
        Tags: {tags}. Citations: {citations}.
      </p>
    </div>
  );
}
