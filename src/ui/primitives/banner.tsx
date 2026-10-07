import type { ReactNode } from 'react';
import styles from './banner.module.css';

export type NoticeKind = 'info' | 'warning' | 'error' | 'review';

/** Colour is never the only carrier (UI_ARCHITECTURE §11): every kind has a word, and the kind also changes the rule's weight. */
export const NOTICE_WORD: Readonly<Record<NoticeKind, string>> = { info: 'Notice', warning: 'Warning', error: 'Error', review: 'Needs review' };

export interface BannerProps {
  readonly kind: NoticeKind;
  readonly children: ReactNode;
  /** Buttons the notice offers (Reload, Retry ...). */
  readonly actions?: ReactNode;
}

export function Banner(props: BannerProps) {
  return (
    <div className={`${styles.banner} ${styles[props.kind]}`} data-kind={props.kind} role={props.kind === 'error' ? 'alert' : undefined}>
      <span className={styles.word}>{NOTICE_WORD[props.kind]}</span>
      <span className={styles.text}>{props.children}</span>
      {props.actions === undefined ? null : <span className={styles.actions}>{props.actions}</span>}
    </div>
  );
}
