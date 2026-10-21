/**
 * The properties of a species, shown and not yet edited (step 6.6a part 2; the editor arrives in part 3 of the same step). The draft keeps
 * them exactly as they are, so a Save never loses them. Notes, tags and citations are edited in the shared section.
 */
import styles from './editor.module.css';

type Fields = Record<string, unknown>;

export function PropertiesReadOnlySection(props: { readonly draft: unknown }) {
  const fields = (typeof props.draft === 'object' && props.draft !== null ? props.draft : {}) as Fields;
  const properties = Array.isArray(fields.properties) ? (fields.properties as { key?: unknown; value?: unknown }[]) : [];
  return (
    <div>
      <p className={styles.hint}>Editing arrives in step 6.6a, part 3. These are kept unchanged when you save.</p>
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
    </div>
  );
}
