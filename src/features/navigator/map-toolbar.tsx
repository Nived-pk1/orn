/**
 * The map's toolbar on a wide screen (step 8.3b, A1; ADR-044 addendum): ONE row. Zoom out, Zoom in, Fit (icon buttons with names and tooltips),
 * the chapter select, Find a family, From A to B, Open family, a Key button (the legend in a popover) and a More menu (List, and in Studio
 * "Unanchored reactions (n)"). When the row is too narrow `movedToMore` moves From A to B, then Open family, into More. It only reports what
 * the person did; the drawing and the saving are the map's.
 */
import { lazy, Suspense, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Button, IconButton, Menu, type MenuItem } from '@/ui/primitives';
import { ChapterSelect, type ChapterOption } from './chapter-select';
import { movedToMore } from './toolbar-rule';
import styles from './map-room.module.css';
import controls from './map-controls.module.css';

const FindFamily = /* @__PURE__ */ lazy(() => import('./find-family').then((m) => ({ default: m.FindFamily })));

/** The toolbar's own width (a ResizeObserver; none in jsdom: then the row is as wide as it needs). */
function useRowWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(Number.POSITIVE_INFINITY);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null || typeof ResizeObserver === 'undefined') return;
    const read = (): void => setWidth(element.getBoundingClientRect().width);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export interface MapToolbarProps {
  readonly listing: boolean;
  readonly noScene: boolean;
  readonly onToggleList: () => void;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onFit: () => void;
  readonly chapters: readonly ChapterOption[];
  readonly chapterId: string | null;
  readonly onChapter: (id: string | null) => void;
  readonly families: readonly { readonly id: string; readonly name: string }[];
  readonly onFind: (id: string) => void;
  readonly chainOpen: boolean;
  readonly onToggleChain: () => void;
  /** Why Open family cannot act now; undefined when it can. */
  readonly openReason: string | undefined;
  readonly onOpenFamily: () => void;
  /** The selected arrow's Open button (an arrow is selected): its action, and why it cannot act. */
  readonly arrowOpen?: { readonly onOpen: () => void; readonly unavailable?: string };
  /** Studio: "Unanchored reactions (n)". */
  readonly unanchored?: { readonly count: number; readonly expanded: boolean; readonly reason: string | undefined; readonly onToggle: () => void };
  readonly keyOpen: boolean;
  readonly onToggleKey: () => void;
  /** The popover itself (a lazy chunk), drawn under the Key button when it is open. */
  readonly keyPopover: ReactNode;
  /** The multi-selection actions of Studio, at the end of the row. */
  readonly extra?: ReactNode;
}

const NOTHING = 'there is nothing drawn yet';
const NO_ZOOM = 'the List view has no zoom';

export function MapToolbar(props: MapToolbarProps) {
  const row = useRef<HTMLDivElement>(null);
  const moved = movedToMore(useRowWidth(row));
  const chainMoved = moved.includes('chain');
  const openMoved = moved.includes('open');
  const zoomReason = props.listing ? NO_ZOOM : props.noScene ? NOTHING : undefined;
  const unavailable = (reason: string | undefined): { unavailable?: string } => (reason === undefined ? {} : { unavailable: reason });
  const more: MenuItem[] = [
    { id: 'list', label: props.listing ? 'Show the map' : 'List', onSelect: props.onToggleList },
    ...(chainMoved ? [{ id: 'chain', label: 'From A to B', onSelect: props.onToggleChain, ...unavailable(props.noScene ? NOTHING : undefined) }] : []),
    ...(openMoved ? [{ id: 'open', label: 'Open family', onSelect: props.onOpenFamily, ...unavailable(props.noScene ? NOTHING : props.openReason) }] : []),
    ...(openMoved && props.arrowOpen !== undefined ? [{ id: 'open-arrow', label: 'Open the arrow', onSelect: props.arrowOpen.onOpen, ...unavailable(props.arrowOpen.unavailable) }] : []),
    ...(props.unanchored === undefined ? [] : [{ id: 'unanchored', label: `Unanchored reactions (${props.unanchored.count})`, onSelect: props.unanchored.onToggle, ...unavailable(props.unanchored.reason) }]),
  ];
  return (
    <div className={styles.row} ref={row} role="toolbar" aria-label="Canvas tools" data-map-toolbar="">
      <IconButton label="Zoom out" icon="zoom-out" variant="default" className={styles.zoomButton} onClick={props.onZoomOut} {...unavailable(zoomReason)} />
      <IconButton label="Zoom in" icon="zoom-in" variant="default" className={styles.zoomButton} onClick={props.onZoomIn} {...unavailable(zoomReason)} />
      <IconButton label="Fit" icon="fit" variant="default" className={styles.zoomButton} onClick={props.onFit} {...unavailable(zoomReason)} />
      <span className={styles.chapterBox}>
        <ChapterSelect chapters={props.chapters} value={props.chapterId} onChange={props.onChapter} />
      </span>
      <Suspense fallback={<input className={controls.findBox} disabled aria-label="Loading" />}>
        <FindFamily families={props.families} onChoose={props.onFind} />
      </Suspense>
      {chainMoved ? null : (
        <Button aria-pressed={props.chainOpen} onClick={props.onToggleChain} {...unavailable(props.noScene ? NOTHING : undefined)}>
          From A to B
        </Button>
      )}
      {openMoved ? null : (
        <>
          <Button onClick={props.onOpenFamily} {...unavailable(props.noScene ? NOTHING : props.openReason)}>
            Open family
          </Button>
          {props.arrowOpen === undefined ? null : (
            <Button onClick={props.arrowOpen.onOpen} {...unavailable(props.arrowOpen.unavailable)}>
              Open
            </Button>
          )}
        </>
      )}
      <span className={styles.spacer} />
      <span className={styles.keyWrap} data-key-wrap="">
        <Button aria-expanded={props.keyOpen} aria-haspopup="dialog" onClick={props.onToggleKey} data-key-button="">
          Key
        </Button>
        {props.keyOpen ? props.keyPopover : null}
      </span>
      <Menu label="More" items={more} />
      {props.extra}
    </div>
  );
}
