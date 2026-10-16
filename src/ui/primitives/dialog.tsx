/**
 * Dialog: the native `<dialog>` element opened with `showModal()` (CSP spike, step 5.2: no violation, the browser makes the rest of
 * the page inert and keeps focus inside; Radix Dialog with `modal={false}` passed as well, and the rule is "both pass -> native").
 * The component adds what the browser does not do the same way everywhere: focus goes back to the control that opened it (WebKit does
 * not focus a clicked button, so the click target is remembered), Esc closes only the TOPMOST layer (`layers.ts`), the open state is
 * the caller's (controlled), a menu or tooltip opened inside it mounts inside it (`PortalContainerContext`).
 */
import { useCallback, useEffect, useId, useRef, useState, type MouseEvent, type ReactNode, type SyntheticEvent } from 'react';
import styles from './dialog.module.css';
import { isTopLayer, pushLayer } from './layers';
import { PortalContainerContext } from './portal-container';

export interface DialogProps {
  readonly open: boolean;
  /** Asked to close: Esc (when topmost), the close button, a click on the backdrop when `dismissOnBackdrop`. The caller sets `open`. */
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
  /** Buttons at the foot (the caller's actions). */
  readonly footer?: ReactNode;
  readonly dismissOnBackdrop?: boolean;
  /** A CSS selector inside the dialog whose element takes the focus when it opens (default: the browser's first focusable element, the close button). */
  readonly initialFocus?: string;
  /** `wide`: for a dialog that holds lists and choices (the import screen); the default is the narrow one. */
  readonly size?: 'default' | 'wide' | 'screen';
  /** `false`: the dialog cannot be dismissed while the caller's work runs - no Close button, Esc and the backdrop do nothing (default true). */
  readonly closable?: boolean;
}

const ACTIVATORS = 'button, [role="button"], [role="menuitem"], a[href], input, select, textarea, [tabindex]';
let lastActivator: HTMLElement | null = null;
let listening = false;

/** Safari and WebKit do not focus a button on click; remember what was clicked so focus can return to it. */
function listenForActivators(): void {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>(ACTIVATORS) : null;
      if (target !== null) lastActivator = target;
    },
    true,
  );
}

function openerNow(): HTMLElement | null {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) return active;
  return lastActivator !== null && lastActivator.isConnected ? lastActivator : null;
}

export function Dialog(props: DialogProps) {
  const { open, onClose, title, children, footer, dismissOnBackdrop = false, initialFocus, size = 'default', closable = true } = props;
  const element = useRef<HTMLDialogElement | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const layerId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const attach = useCallback((node: HTMLDialogElement | null) => {
    element.current = node;
    setContainer(node);
  }, []);

  useEffect(() => {
    listenForActivators();
    const node = element.current;
    if (node === null) return undefined;
    if (!open) {
      if (node.open) node.close();
      return undefined;
    }
    opener.current = openerNow();
    if (!node.open) node.showModal();
    if (initialFocus !== undefined) node.querySelector<HTMLElement>(initialFocus)?.focus();
    const release = pushLayer(layerId);
    return () => {
      release();
      if (node.open) node.close();
      const back = opener.current;
      opener.current = null;
      if (back !== null && back.isConnected) back.focus();
    };
  }, [open, layerId, initialFocus]);

  // Esc: the browser's own close is always cancelled; the caller's state decides, and only the topmost layer asks.
  const onCancel = (event: SyntheticEvent<HTMLDialogElement>): void => {
    event.preventDefault();
    if (closable && isTopLayer(layerId)) closeRef.current();
  };
  const onBackdrop = (event: MouseEvent<HTMLDialogElement>): void => {
    if (closable && dismissOnBackdrop && event.target === event.currentTarget && isTopLayer(layerId)) closeRef.current();
  };

  return (
    <dialog ref={attach} className={size === 'default' ? styles.dialog : `${styles.dialog} ${styles[size]}`} aria-labelledby={titleId} onCancel={onCancel} onClick={onBackdrop}>
      {open ? (
        <PortalContainerContext.Provider value={container}>
          <div className={styles.frame}>
            <header className={styles.header}>
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
              {closable ? (
                <button type="button" className={styles.close} aria-label="Close" onClick={() => isTopLayer(layerId) && closeRef.current()}>
                  ×
                </button>
              ) : null}
            </header>
            <div className={styles.body}>{children}</div>
            {footer === undefined || footer === null ? null : <footer className={styles.footer}>{footer}</footer>}
          </div>
        </PortalContainerContext.Provider>
      ) : null}
    </dialog>
  );
}
