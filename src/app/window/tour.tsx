/**
 * The first-run tour (step 8.4g Part B, G4), a lazy chunk: three short coach marks, one at a time, each with Next (Done on the last) and Skip.
 * Not modal: nothing else on the page is blocked, and Esc is Skip. A mark points at its element (found by what the page already has: the Map item, the Search button, the Starred item; a collapsed rail: its Expand button) and stands in the middle of the window with the same words only when no anchor exists at all. The focus goes to the mark's main button on each mark. No motion
 * when the reader asked for none (the style turns the fade off).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/ui/primitives';
import styles from './tour.module.css';

/** The Map or Starred item: the rail's button on a desktop, the tab on a phone; a collapsed or missing item points at the rail's Expand button. */
const viewItem = (label: string): HTMLElement | undefined => {
  const items = [...document.querySelectorAll<HTMLElement>('nav[aria-label="Modes"] button, nav[aria-label="Home"] button')];
  return items.find((item) => (item.title || item.textContent || '').trim().startsWith(label)) ?? items.find((item) => item.getAttribute('aria-label') === 'Expand');
};

export const TOUR_STEPS: readonly { readonly target: () => HTMLElement | null | undefined; readonly text: string }[] = [
  { target: () => viewItem('Map'), text: 'The Map shows every family. Tap one to see what it makes and what it is made from.' },
  { target: () => document.querySelector<HTMLElement>('[aria-label^="Search"]'), text: 'Find any compound, reaction or reagent' },
  { target: () => viewItem('Starred'), text: 'Press the star on any record to keep it here for revision.' },
];

const WIDTH = 288;
const GAP = 12;

/** The place of the mark: under its element when there is room, else above it; always inside the window. Pure arithmetic on rectangles. */
export function placeMark(rect: { top: number; left: number; width: number; height: number } | undefined, view: { width: number; height: number }, markHeight: number): { top: number; left: number } {
  if (rect === undefined) return { top: Math.max(8, (view.height - markHeight) / 2), left: Math.max(8, (view.width - WIDTH) / 2) };
  const below = rect.top + rect.height + GAP;
  const top = below + markHeight + 8 <= view.height ? below : Math.max(8, rect.top - markHeight - GAP);
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - WIDTH / 2), Math.max(8, view.width - WIDTH - 8));
  return { top, left };
}

export function Tour(props: { readonly onFinish: () => void }) {
  const [at, setAt] = useState(0);
  const step = TOUR_STEPS[at] as (typeof TOUR_STEPS)[number];
  const last = at === TOUR_STEPS.length - 1;
  const card = useRef<HTMLElement>(null);
  const main = useRef<HTMLButtonElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number; anchored: boolean }>({ top: 0, left: 8, anchored: false });
  const { onFinish } = props;
  useLayoutEffect(() => {
    const target = step.target();
    const box = target?.getBoundingClientRect();
    const found = box !== undefined && box.width > 0 && box.height > 0;
    const spot = placeMark(found ? { top: box.top, left: box.left, width: box.width, height: box.height } : undefined, { width: window.innerWidth, height: window.innerHeight }, card.current?.offsetHeight ?? 120);
    setPlace({ ...spot, anchored: found });
  }, [step]);
  useEffect(() => main.current?.focus(), [at]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) onFinish();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onFinish]);
  return (
    <section ref={card} className={styles.mark} aria-label="Tour" data-anchored={String(place.anchored)} style={{ top: place.top, left: place.left, width: WIDTH }}>
      <p className={styles.count}>
        {at + 1} of {TOUR_STEPS.length}
      </p>
      <p className={styles.text}>{step.text}</p>
      <div className={styles.actions}>
        <Button variant="quiet" onClick={onFinish}>
          Skip
        </Button>
        <Button ref={main} variant="primary" onClick={last ? onFinish : () => setAt(at + 1)}>
          {last ? 'Done' : 'Next'}
        </Button>
      </div>
    </section>
  );
}
