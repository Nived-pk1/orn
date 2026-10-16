/**
 * The phone's bottom tab bar (ADR-039): Families | Map | Search, 48 px, an icon and a word each, the current tab marked (aria-current and
 * a bar, never colour alone). Families and Map are places: the last one is saved in `uiState`, and pressing one leaves an open family
 * page. Search is an action: it opens the palette (full screen on a phone).
 */
import { useStore } from 'zustand';
import type { IconName } from '@/ui/primitives';
import { Icon } from '@/ui/primitives';
import type { PhoneTab } from '@/ui/state';
import { useNavigator } from './navigator-context';
import styles from './phone-home.module.css';

const TABS: readonly { readonly id: PhoneTab; readonly label: string; readonly icon: IconName }[] = [
  { id: 'families', label: 'Families', icon: 'families' },
  { id: 'map', label: 'Map', icon: 'map' },
];

export function PhoneTabs(props: { readonly onSearch: () => void; readonly searching: boolean }) {
  const { ports } = useNavigator();
  const tab = useStore(ports.ui.overview, (s) => s.phoneTab);
  const go = (next: PhoneTab): void => {
    ports.ui.overview.getState().setPhoneTab(next);
    ports.ui.family.getState().closeFamily();
  };
  return (
    <nav className={styles.tabs} aria-label="Home">
      {TABS.map((item) => (
        <button key={item.id} type="button" className={styles.tab} {...(tab === item.id && !props.searching ? { 'aria-current': 'page' as const } : {})} onClick={() => go(item.id)}>
          <Icon name={item.icon} size={20} />
          <span>{item.label}</span>
        </button>
      ))}
      <button type="button" className={styles.tab} {...(props.searching ? { 'aria-current': 'page' as const } : {})} aria-haspopup="dialog" onClick={props.onSearch}>
        <Icon name="search" size={20} />
        <span>Search</span>
      </button>
    </nav>
  );
}
