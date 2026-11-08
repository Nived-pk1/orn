/** The notices bell (step 8.4d, Part C): the icon button with the count of notices in a badge. Presentational; the list it opens is the caller's. */
import { IconButton } from '@/ui/primitives';
import styles from './notice-bell.module.css';

export function NoticeBellButton(props: { readonly count: number; readonly onOpen: () => void; readonly unavailable?: string }) {
  const { count } = props;
  return (
    <IconButton
      label={count > 0 ? `Notices, ${count}` : 'Notices'}
      icon="bell"
      aria-haspopup="dialog"
      className={styles.bell}
      onClick={props.onOpen}
      {...(props.unavailable === undefined ? {} : { unavailable: props.unavailable })}
      badge={count > 0 ? <span className={styles.badge}>{count > 99 ? '99+' : count}</span> : null}
    />
  );
}
