/**
 * The navigator's two screens (step 5.5b; ADR-037): the overview map or, when a family is open, its page. The open family is a UI
 * store (saved in `uiState`), so a reload comes back to the same screen. Going back to the overview mounts the canvas again with the
 * viewport and the selection it left (both live in UI stores, not in the canvas). The screen's ONE polite live region is here
 * (step 5.7, item h), so what the canvas or the page says is heard whichever of them is mounted.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import { LiveRegion } from '@/ui/primitives';
import { FamilyPage } from './family-page';
import { NavigatorCanvas } from './navigator-canvas';
import { useNavigator, useNavigatorState } from './navigator-context';
import { useAnnouncements } from './use-announcements';

export function NavigatorView() {
  const { ports, announcer } = useNavigator();
  const open = useStore(ports.ui.family, (s) => s.open);
  const { scene } = useNavigatorState();
  useAnnouncements(ports, announcer, scene);
  const said = useSyncExternalStore(announcer.subscribe, announcer.get, announcer.get);
  // Coming back from a family page, the overview takes the keyboard focus on the family just left (a page that was closed by the keyboard).
  const previous = useRef<string | null>(open);
  const returnTo = open === null ? previous.current : null;
  useEffect(() => {
    previous.current = open;
  }, [open]);
  return (
    <>
      {open === null ? <NavigatorCanvas {...(returnTo === null ? {} : { returnTo })} /> : <FamilyPage hubId={open} />}
      <LiveRegion message={said.message} serial={said.serial} label="Navigator announcements" />
    </>
  );
}
