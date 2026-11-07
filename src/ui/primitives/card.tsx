/**
 * The one card (step 8.4a, Part B): padding 16 (phone 12), radius 8, 1 px border, surface background, title 16/600, meta 14 muted, gap 8.
 * Selected is an inset ring that never moves layout. `CardButton` is a whole-card button (chain cards, go-next cards): focus ring, hover border.
 * Text only; no chemistry here.
 */
import { forwardRef, useId, type ButtonHTMLAttributes, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import styles from './card.module.css';
import { VisuallyHidden } from './visually-hidden';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  readonly as?: 'div' | 'li' | 'article' | 'section';
  readonly selected?: boolean;
}

export function Card(props: CardProps) {
  const { as: Tag = 'div', selected, className, children, ...rest } = props;
  return (
    <Tag {...rest} className={[styles.card, styles.stack, className].filter(Boolean).join(' ')} data-selected={selected === true ? 'true' : undefined}>
      {children}
    </Tag>
  );
}

export interface CardButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-disabled' | 'aria-describedby' | 'aria-pressed'> {
  readonly selected?: boolean;
  /** Why this card cannot be used now: it stays focusable, does nothing, and says why. */
  readonly unavailable?: string;
}

export const CardButton = forwardRef<HTMLButtonElement, CardButtonProps>(function CardButton(props, ref) {
  const { selected, unavailable, onClick, className, children, type = 'button', ...rest } = props;
  const reasonId = useId();
  const blocked = unavailable !== undefined;
  const click = (event: MouseEvent<HTMLButtonElement>): void => {
    if (blocked) event.preventDefault();
    else onClick?.(event);
  };
  return (
    <>
      <button
        {...rest}
        ref={ref}
        type={type}
        className={[styles.card, styles.stack, styles.whole, className].filter(Boolean).join(' ')}
        aria-pressed={selected === undefined ? undefined : selected}
        aria-disabled={blocked ? true : undefined}
        aria-describedby={blocked ? reasonId : undefined}
        data-selected={selected === true ? 'true' : undefined}
        onClick={click}
      >
        {children}
      </button>
      {blocked ? <VisuallyHidden id={reasonId}>{unavailable}</VisuallyHidden> : null}
    </>
  );
});

export function CardTitle(props: { readonly children: ReactNode }) {
  return <span className={styles.title}>{props.children}</span>;
}

export function CardMeta(props: { readonly children: ReactNode }) {
  return <span className={styles.meta}>{props.children}</span>;
}
