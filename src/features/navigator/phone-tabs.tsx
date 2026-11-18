/**
 * The phone's bottom tab bar (ADR-039): Chapters | Families | Map | Explore | Starred (Chapters since 7.3b; Explore opens the last explorer, now Reactions; step 7.1b), 48 px, an icon and a word each, the current tab marked (aria-current and
 * a bar, never colour alone). Families and Map are places: the last one is saved in `uiState`, and pressing one leaves an open family
 * page. Starred is a place the app shows (the records the reader starred; step 8.4g Part B); Search moved to the top bar.
 */
import { useStore } from 'zustand';
import type { IconName } from '@/ui/primitives';
import { Icon } from '@/ui/primitives';
import type { PhoneTab } from '@/ui/state';
import { useNavigator } from './navigator-context';
import styles from './phone-home.module.css';

const TABS: readonly { readonly id: PhoneTab; readonly label: string; readonly icon: IconName }[] = [
  { id: 'chapters', label: 'Chapters', icon: 'book-open' },
  { id: 'families', label: 'Families', icon: 'layers' },
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'explore', label: 'Explore', icon: 'compass' },
];

export function PhoneTabs(props: { readonly onStarred: () => void; readonly starred: boolean; /** Called on every press of a tab, also of the tab already chosen (the app leaves Settings by it). */ readonly onTab?: (tab: PhoneTab) => void }) {
  const { ports } = useNavigator();
  const tab = useStore(ports.ui.overview, (s) => s.phoneTab);
  const go = (next: PhoneTab): void => {
    ports.ui.overview.getState().setPhoneTab(next);
    ports.ui.family.getState().closeFamily();
    props.onTab?.(next);
  };
  return (
    <nav className={styles.tabs} aria-label="Home">
      {TABS.map((item) => (
        <button key={item.id} type="button" title={item.label} className={styles.tab} {...(tab === item.id && !props.starred ? { 'aria-current': 'page' as const } : {})} onClick={() => go(item.id)}>
          <Icon name={item.icon} size={20} />
          <span>{item.label}</span>
        </button>
      ))}
      <button type="button" title="Starred" className={styles.tab} {...(props.starred ? { 'aria-current': 'page' as const } : {})} onClick={props.onStarred}>
        <Icon name="star" size={20} />
        <span>Starred</span>
      </button>
    </nav>
  );
}
