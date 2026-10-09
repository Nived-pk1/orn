/**
 * The navigator's two screens (step 5.5b; ADR-037): the overview map or, when a family is open, its page. The open family is a UI
 * store (saved in `uiState`), so a reload comes back to the same screen. Going back to the overview mounts the canvas again with the
 * viewport and the selection it left (both live in UI stores, not in the canvas).
 */
import { useStore } from 'zustand';
import { FamilyPage } from './family-page';
import { NavigatorCanvas } from './navigator-canvas';
import { useNavigator } from './navigator-context';

export function NavigatorView() {
  const { ports } = useNavigator();
  const open = useStore(ports.ui.family, (s) => s.open);
  return open === null ? <NavigatorCanvas /> : <FamilyPage hubId={open} />;
}
