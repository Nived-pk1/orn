/**
 * ContextMenu (step 5.7, item g): the Menu primitive opened at a point instead of from a button (a right click, a long press, the
 * context-menu key). It is Radix DropdownMenu with `modal={false}` for the same CSP reason as `Menu` (a modal layer injects a
 * `<style>` element). The anchor is a 1 px button placed with CSSOM at the point (not an inline style attribute); it is not in the
 * tab order and not announced. Arrow keys, Home/End, type-ahead, Enter and Esc come from Radix; when the menu closes, `onCloseFocus`
 * says where the focus goes (the canvas), never to the hidden anchor. An item that cannot apply is shown with its reason.
 */
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { useEffect, useRef } from 'react';
import type { MenuItem } from './menu';
import styles from './menu.module.css';
import { usePortalContainer } from './portal-container';

export interface ContextMenuProps {
  /** Where to open (client coordinates), or null for closed. */
  readonly at: { readonly x: number; readonly y: number } | null;
  /** The menu's accessible name, e.g. "Alcohols". */
  readonly label: string;
  readonly items: readonly MenuItem[];
  /** Called when the menu closes for any reason (an item was chosen, Esc, a click outside). */
  readonly onClose: () => void;
  /** Called after it closed, to put the focus back where it came from. */
  readonly onCloseFocus?: () => void;
}

export function ContextMenu(props: ContextMenuProps) {
  const container = usePortalContainer();
  const anchor = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const { at } = props;
  useEffect(() => {
    const element = anchor.current;
    if (element === null || at === null) return;
    element.style.left = `${at.x}px`;
    element.style.top = `${at.y}px`;
    // the first item takes the focus once the menu is mounted (Radix would focus the menu itself, as for a pointer)
    const frame = window.requestAnimationFrame(() => content.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [at]);
  return (
    <Dropdown.Root open={at !== null} onOpenChange={(open) => !open && props.onClose()} modal={false}>
      {/* Radix names the menu by its trigger (aria-labelledby), so the hidden anchor carries the menu's name. */}
      <Dropdown.Trigger ref={anchor} className={styles.anchor} tabIndex={-1} aria-hidden="true" aria-label={props.label} />
      <Dropdown.Portal {...(container === undefined ? {} : { container })}>
        <Dropdown.Content
          ref={content}
          className={styles.content}
          sideOffset={2}
          align="start"
          collisionPadding={8}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            props.onCloseFocus?.();
          }}
        >
          {props.items.map((item) => (
            <Dropdown.Item
              key={item.id}
              className={styles.item}
              data-unavailable={item.unavailable === undefined ? undefined : ''}
              aria-disabled={item.unavailable === undefined ? undefined : true}
              onSelect={(event) => {
                if (item.unavailable !== undefined) event.preventDefault();
                else item.onSelect?.();
              }}
            >
              <span>{item.label}</span>
              {item.unavailable === undefined ? null : <span className={styles.reason}>{item.unavailable}</span>}
            </Dropdown.Item>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
