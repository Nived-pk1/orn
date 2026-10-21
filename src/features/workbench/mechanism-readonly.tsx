/**
 * The mechanism classes of a mechanism, shown and not yet edited (step 6.6a part 2; the editor arrives in part 3 of the same step). Kept
 * unchanged by Save. Notes, concepts, tags and citations are edited in the shared section.
 */
import styles from './editor.module.css';

export function MechanismReadOnlySection(props: { readonly draft: unknown }) {
  const fields = (typeof props.draft === 'object' && props.draft !== null ? props.draft : {}) as Record<string, unknown>;
  const count = Array.isArray(fields.mechanismClasses) ? fields.mechanismClasses.length : 0;
  return (
    <div>
      <p className={styles.hint}>Editing arrives in step 6.6a, part 3. These are kept unchanged when you save.</p>
      <p>Mechanism classes: {count}.</p>
    </div>
  );
}
