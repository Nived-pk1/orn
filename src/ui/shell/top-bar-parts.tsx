/** The pieces of the desktop top bar (step 8.4d, Part C): the app mark, the breadcrumb and the search / command box. Presentational. */
import { Icon } from '@/ui/primitives';
import styles from './top-bar-parts.module.css';

export interface ShellCrumb {
  readonly section: string;
  readonly record?: string | undefined;
}

export function AppMark() {
  return (
    <span className={styles.mark} data-app-mark="" aria-hidden="true">
      <Icon name="mark" />
    </span>
  );
}

/** "view > record": the last part is the current page. */
export function Breadcrumb(props: { readonly crumb: ShellCrumb }) {
  const { section, record } = props.crumb;
  const hasRecord = record !== undefined && record !== '';
  return (
    <nav className={styles.crumb} aria-label="Breadcrumb">
      <span className={styles.section} {...(hasRecord ? {} : { 'aria-current': 'page' as const })}>
        {section}
      </span>
      {hasRecord ? (
        <>
          <Icon name="chevron-right" />
          <b className={styles.record} aria-current="page" title={record}>
            {record}
          </b>
        </>
      ) : null}
    </nav>
  );
}

/** The search box in the middle of the bar: it says what it does and what key opens it. */
export function CommandBox(props: { readonly onOpen: () => void }) {
  return (
    <button type="button" className={styles.commandBox} aria-label="Search or jump to…" aria-keyshortcuts="Control+K Meta+K" aria-haspopup="dialog" onClick={props.onOpen}>
      <Icon name="search" />
      <span className={styles.commandText} aria-hidden="true">
        Search or jump to…
      </span>
      <kbd className={styles.kbd} aria-hidden="true">
        Ctrl K
      </kbd>
    </button>
  );
}
