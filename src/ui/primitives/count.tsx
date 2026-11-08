/** The count badge (step 8.4d, Part D): a small number in a pill, tabular figures. Past 99 it reads "99+"; assistive technology hears the true number. */
import { VisuallyHidden } from './visually-hidden';
import styles from './count.module.css';

const whole = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);

export function Count(props: { readonly value: number; readonly className?: string }) {
  const value = whole(props.value);
  return (
    <span className={[styles.count, props.className].filter(Boolean).join(' ')}>
      <span aria-hidden={value > 99 ? 'true' : undefined}>{value > 99 ? '99+' : value}</span>
      {value > 99 ? <VisuallyHidden>{`${value} in all`}</VisuallyHidden> : null}
    </span>
  );
}
