import type { ReactNode, Ref } from 'react';
import { Icon, type IconName } from './icons';
import { VisuallyHidden } from './visually-hidden';
import styles from './banner.module.css';

export type NoticeKind = 'info' | 'warning' | 'error' | 'review';

/** Colour is never the only carrier (UI_ARCHITECTURE §11): every kind has a word, and the kind also changes the rule's weight. */
export const NOTICE_WORD: Readonly<Record<NoticeKind, string>> = { info: 'Notice', warning: 'Warning', error: 'Error', review: 'Needs review' };

const KIND_ICON: Readonly<Record<NoticeKind, IconName>> = { info: 'info', warning: 'triangle-alert', error: 'triangle-alert', review: 'clipboard-check' };

export interface BannerProps {
  readonly kind: NoticeKind;
  readonly children: ReactNode;
  /** Buttons the notice offers (Reload, Retry ...). */
  readonly actions?: ReactNode;
  /** One line: the text is cut with an ellipsis (the band; step 8.4a). `expanded` shows it whole. */
  readonly compact?: boolean;
  readonly expanded?: boolean;
  readonly textRef?: Ref<HTMLSpanElement>;
  /** The whole text as a tooltip, for a cut one-line form. */
  readonly title?: string;
}

export function Banner(props: BannerProps) {
  const compact = props.compact === true && props.expanded !== true;
  return (
    <div className={`${styles.banner} ${styles[props.kind]} ${compact ? styles.compact : ''}`} data-kind={props.kind} role={props.kind === 'error' ? 'alert' : undefined}>
      <span className={styles.icon}>
        <Icon name={KIND_ICON[props.kind]} />
      </span>
      <VisuallyHidden>{NOTICE_WORD[props.kind]}</VisuallyHidden>
      <span ref={props.textRef} className={styles.text} {...(props.title === undefined ? {} : { title: props.title })}>{props.children}</span>
      {props.actions === undefined ? null : <span className={styles.actions}>{props.actions}</span>}
    </div>
  );
}
