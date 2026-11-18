/** The keyboard shortcuts sheet (step 8.4g Part B, G5), a lazy chunk. Every line is read from the key map; nothing here is a hand-written list. */
import { Dialog } from '@/ui/primitives';
import { shortcutGroups } from './key-words';
import styles from './shortcuts-sheet.module.css';

export function ShortcutsSheet(props: { readonly studio: boolean; readonly onClose: () => void }) {
  return (
    <Dialog open onClose={props.onClose} title="Keyboard shortcuts" dismissOnBackdrop>
      <div className={styles.sheet}>
        {shortcutGroups(props.studio).map((group) => (
          <section key={group.title} aria-label={group.title}>
            <h3 className={styles.heading}>{group.title}</h3>
            <dl className={styles.list}>
              {group.entries.map((entry) => (
                <div key={entry.label} className={styles.row}>
                  <dt>{entry.label}</dt>
                  <dd>
                    {entry.keys.map((key) => (
                      <kbd key={key} className={styles.key}>
                        {key}
                      </kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
