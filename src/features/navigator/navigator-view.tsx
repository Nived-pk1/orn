/**
 * The navigator's two screens (step 5.5b; ADR-037): the overview map or, when a family is open, its page. The open family is a UI
 * store (saved in `uiState`), so a reload comes back to the same screen. Going back to the overview mounts the canvas again with the
 * viewport and the selection it left (both live in UI stores, not in the canvas). The screen's ONE polite live region is here
 * (step 5.7, item h), so what the canvas or the page says is heard whichever of them is mounted.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import { useLayoutMode } from '@/ui/hooks';
import { LiveRegion, Skeleton } from '@/ui/primitives';
import { useStudyChrome } from '@/ui/study-chrome';
import { FamiliesTab } from './families-tab';
import { useNavigator, useNavigatorState } from './navigator-context';
import { useAnnouncements } from './use-announcements';

// the map canvas (d3, the viewport, the pointer machine) is its own chunk (step 8.4s, L1); `warmNavigatorCanvas` starts the same import early
const loadCanvas = () => import('./navigator-canvas').then((m) => ({ default: m.NavigatorCanvas }));
const NavigatorCanvas = /* @__PURE__ */ lazy(loadCanvas);
export const warmNavigatorCanvas = (): void => {
  void loadCanvas();
};
// the family page is not part of the first screen: its own chunk (step 8.3b, Part 0.1)
const FamilyPage = /* @__PURE__ */ lazy(() => import('./family-page').then((m) => ({ default: m.FamilyPage })));

/** Mounts with the canvas (same Suspense boundary, so only once the chunk is in): the return target has been used. */
function Arrived(props: { readonly onArrive: () => void }) {
  const { onArrive } = props;
  useEffect(onArrive, [onArrive]);
  return null;
}

export function NavigatorView() {
  const { ports, announcer } = useNavigator();
  const open = useStore(ports.ui.family, (s) => s.open);
  const phone = useLayoutMode() === 'phone';
  const tab = useStore(ports.ui.overview, (s) => s.phoneTab);
  const { scene } = useNavigatorState();
  useAnnouncements(ports, announcer, scene, useStudyChrome().selectionLine);
  const said = useSyncExternalStore(announcer.subscribe, announcer.get, announcer.get);
  // Coming back from a family page, the overview takes the keyboard focus on the family just left (a page that was closed by the keyboard).
  const previous = useRef<string | null>(open);
  const returnTo = open === null ? previous.current : null;
  // The family just left stays the return target until the (lazy) canvas has mounted: a re-render while its chunk loads must not drop it.
  useEffect(() => {
    if (open !== null) previous.current = open;
  }, [open]);
  const arrived = useCallback(() => {
    previous.current = null;
  }, []);
  return (
    <>
      {open !== null ? (
        <Suspense fallback={null}>
          <FamilyPage hubId={open} />
        </Suspense>
      ) : phone && tab === 'families' ? <FamiliesTab /> : (
        <Suspense fallback={<Skeleton label="Loading the navigator" />}>
          <NavigatorCanvas {...(returnTo === null ? {} : { returnTo })} />
          <Arrived onArrive={arrived} />
        </Suspense>
      )}
      <LiveRegion message={said.message} serial={said.serial} label="Navigator announcements" />
    </>
  );
}
