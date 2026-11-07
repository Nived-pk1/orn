/**
 * The status line's words (step 8.4b, G3): a short word is real text marked `aria-hidden`, and the full words sit beside it in a visually hidden
 * list (the one page text for readers and tests). A word that is the same short and full is drawn once, as ordinary text. No CSS `content` for words.
 */
import styles from './full-status.module.css';

export interface StatusWord {
  readonly id: string;
  readonly short: string;
  readonly full: string;
}

export function StatusWords(props: { readonly items: readonly StatusWord[] }) {
  const longer = props.items.filter((item) => item.short !== item.full);
  return (
    <>
      <span className={styles.shortLine}>
        {props.items.map((item) =>
          item.short === item.full ? (
            <span key={item.id} className={styles.shortItem} data-short-item="">
              {item.full}
            </span>
          ) : (
            <span key={item.id} className={styles.shortItem} data-short-item="" aria-hidden="true">
              {item.short}
            </span>
          ),
        )}
      </span>
      {longer.length === 0 ? null : (
        <ul className={styles.fullText}>
          {longer.map((item) => (
            <li key={item.id}>{item.full}</li>
          ))}
        </ul>
      )}
    </>
  );
}
