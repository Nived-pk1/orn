/** The quiet line of "Only <exam>" (step 8.3b, B2): what is hidden and the way to show it ("Show them" switches to Everything). */
import { hiddenLineOf } from './hidden-line';
import styles from './study-page.module.css';

export function HiddenLine(props: { readonly count: number; readonly noun: readonly [string, string]; readonly examName: string | undefined; readonly onShow: () => void }) {
  const words = hiddenLineOf(props.count, props.noun, props.examName);
  if (words === undefined) return null;
  return (
    <p className={styles.hiddenLine} data-hidden-line="">
      {words.text} ·{' '}
      <button type="button" className={styles.linkButton} onClick={props.onShow}>
        {words.action}
      </button>
    </p>
  );
}
