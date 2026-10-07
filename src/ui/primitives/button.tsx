/**
 * Button and IconButton (step 5.2). Nothing is a silent no-op (E8): a control that cannot apply is `unavailable` with a REASON. It
 * stays focusable (`aria-disabled`, not `disabled`), ignores activation, and says why to assistive technology and, for an
 * IconButton, in its tooltip. A control with no reason is simply enabled.
 */
import { forwardRef, useId, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import styles from './button.module.css';
import { Icon, type IconName } from './icons';
import { Tooltip } from './tooltip';
import { VisuallyHidden } from './visually-hidden';

type Native = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-disabled' | 'aria-describedby'>;

export interface ButtonProps extends Native {
  readonly variant?: 'default' | 'primary' | 'quiet';
  /** Why this control cannot be used now. Present: the button is `aria-disabled`, does nothing on activation, and shows the reason. */
  readonly unavailable?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(props, ref) {
  const { variant = 'default', unavailable, onClick, className, children, type = 'button', ...rest } = props;
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
        className={[styles.button, styles[variant], className].filter(Boolean).join(' ')}
        aria-disabled={blocked ? true : undefined}
        aria-describedby={blocked ? reasonId : undefined}
        onClick={click}
      >
        {children}
      </button>
      {blocked ? <VisuallyHidden id={reasonId}>{unavailable}</VisuallyHidden> : null}
    </>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'aria-label'> {
  /** The accessible name and the tooltip text (required: an icon alone names nothing). */
  readonly label: string;
  readonly icon: IconName;
  readonly badge?: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(props, ref) {
  const { label, icon, badge, unavailable, variant = 'quiet', className, ...rest } = props;
  return (
    <Tooltip content={unavailable === undefined ? label : `${label}: ${unavailable}`}>
      <Button {...rest} ref={ref} variant={variant} unavailable={unavailable} aria-label={label} className={[styles.icon, className].filter(Boolean).join(' ')}>
        <Icon name={icon} />
        {badge}
      </Button>
    </Tooltip>
  );
});
