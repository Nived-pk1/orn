/**
 * The one chip (step 8.4a, Part B): 24 px high (phone 28), 12 px text (phone 14), pill radius. Kinds: neutral, family (a tone), exam, status.
 * The words always carry the meaning; the kind only changes the look. The review DOT is not a chip.
 */
import type { HTMLAttributes } from 'react';
import styles from './chip.module.css';

export type ChipKind = 'neutral' | 'family' | 'exam' | 'status';
export type ChipTone = 'blue' | 'green' | 'amber' | 'violet' | 'teal' | 'rose' | 'slate';

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  readonly kind?: ChipKind;
  /** Only for `family`. */
  readonly tone?: ChipTone;
}

export function Chip(props: ChipProps) {
  const { kind = 'neutral', tone, className, children, ...rest } = props;
  return (
    <span {...rest} className={[styles.chip, styles[kind], className].filter(Boolean).join(' ')} data-chip={kind} data-tone={kind === 'family' ? tone : undefined}>
      {children}
    </span>
  );
}
