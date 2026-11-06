/** The selection as a visually hidden live region (step 8.3b, A2): screen readers keep it; sighted people read it in the corner of the map and in the inspector. */
import { useStore } from 'zustand';
import { useStudyChrome } from '@/ui/study-chrome';
import { useNavigator, useNavigatorState } from './navigator-context';
import { selectionWordsOf } from './selection-words';
import styles from './map-room.module.css';

export function NavigatorSelection(props: { /** The multi-selection in words (Studio; step 6.8b): shown instead of the single selection. */ readonly multiLine?: string }) {
  const { ports } = useNavigator();
  const selected = useStore(ports.ui.selection, (s) => s.selected);
  const reaction = useStore(ports.ui.family, (s) => s.reaction);
  const { scene } = useNavigatorState();
  const chrome = useStudyChrome();
  // a reaction picked in the Unanchored panel (or on a family page) is the selection when nothing on the map is
  const line = (text: string) => (
    <p className={styles.liveOnly} role="status" data-selection-line="">
      {text}
    </p>
  );
  if (props.multiLine !== undefined) return line(props.multiLine);
  if (selected === null && reaction !== null) return line(`Selected: reaction ${ports.store.getState().records.reaction[reaction]?.name ?? reaction}.`);
  if (selected === null) return line('Nothing is selected.');
  const found = selectionWordsOf(scene, selected, chrome.selectionLine);
  return line(found === undefined ? `Selected: a ${selected.kind} that is not drawn now.` : `Selected: ${found}.`);
}
