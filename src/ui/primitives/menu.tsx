/**
 * Menu: Radix DropdownMenu with `modal={false}` (CSP spike, step 5.2: a modal Radix layer injects a `<style>` element, which the page
 * policy blocks; the non-modal menu is clean in three engines). Arrow keys, Home/End, type-ahead, Enter/Space and Esc come from
 * Radix; focus returns to the trigger. An item that cannot apply (`unavailable`) is shown with its reason, never hidden (E8).
 */
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';
import { Icon } from './icons';
import styles from './menu.module.css';
import { usePortalContainer } from './portal-container';

export interface MenuItem {
  readonly id: string;
  readonly label: string;
  readonly onSelect?: () => void;
  /** Why the item cannot be used now (for example "step 5.9b"). Present: the item is shown, marked unavailable, with this text. */
  readonly unavailable?: string;
}

export interface MenuProps {
  /** The trigger's accessible name; also its visible text unless `trigger` is given. */
  readonly label: string;
  readonly items: readonly MenuItem[];
  readonly trigger?: ReactNode;
}

export function Menu(props: MenuProps) {
  const container = usePortalContainer();
  return (
    <Dropdown.Root modal={false}>
      <Dropdown.Trigger className={styles.trigger} aria-label={props.label}>
        {props.trigger ?? props.label}
        <Icon name="chevron-down" size={12} />
      </Dropdown.Trigger>
      <Dropdown.Portal {...(container === undefined ? {} : { container })}>
        <Dropdown.Content className={styles.content} sideOffset={4} align="start" collisionPadding={8}>
          {props.items.map((item) => (
            <Dropdown.Item
              key={item.id}
              className={styles.item}
              // A Radix `disabled` item cannot be focused or announced with its reason; ours stays reachable and says why.
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
