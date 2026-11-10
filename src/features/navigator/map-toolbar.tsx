/**
 * The map's controls on a wide screen (step 8.4e, A1; ADR-044 addendum): they FLOAT on the canvas, nothing sits in a row above or below it.
 * Top-left a bar: the chapter select, Find a family (an icon that opens its box in the bar), From A to B and More. Top-right the "Selected" bar
 * (Open family, Zoom to selection, Clear) or, with nothing selected, the hint. Bottom-right the zoom stack: Zoom in, Zoom out, Fit. Bottom-left the key
 * strip: what the drawn arrows mean and a Key button that opens the full key. It only reports what the person did; the drawing and the saving
 * are the map's. Fit leaves each control its own free area (`free-areas.tsx` measures the `data-map-control` boxes).
 */
import { lazy, Suspense, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Button, Icon, IconButton, Menu, type MenuItem } from '@/ui/primitives';
import type { Scene } from '@/render/scene';
import { ArrowKey } from './arrow-key';
import { ChapterSelect, type ChapterOption } from './chapter-select';
import type { LegendKey } from './legend';
import { MapHint } from './map-hint';
import { selectionWordsOf } from './selection-words';
import { movedToMore } from './toolbar-rule';
import styles from './map-float.module.css';
import controls from './map-controls.module.css';

const FindFamily = /* @__PURE__ */ lazy(() => import('./find-family').then((m) => ({ default: m.FindFamily })));

/** The layer's own width (a ResizeObserver; none in jsdom: then the bar is as wide as it needs). */
function useLayerWidth(ref: RefObject<HTMLElement | null>): number {
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
  /** The popover itself (a lazy chunk), drawn over the Key button when it is open. */
  readonly keyPopover: ReactNode;
  /** The multi-selection actions of Studio, at the end of the bar. */
  readonly extra?: ReactNode;
  /** What the "Selected" bar and the key strip say (they used to be the map's corner). */
  readonly scene: Scene | null;
  readonly selected: { readonly kind: string; readonly id: string } | null;
  readonly multi: boolean;
  readonly onClear: () => void;
  readonly onZoomSelection: (() => void) | undefined;
  readonly hint: string | undefined;
  readonly hintKind: 'quiet' | 'busy' | undefined;
  readonly keys: LegendKey;
  /** The canvas menu is open: nothing else is operable (it may lie over the key strip). */
  readonly inert?: boolean;
}

const NOTHING = 'there is nothing drawn yet';
const NO_ZOOM = 'the List view has no zoom';

export function MapToolbar(props: MapToolbarProps) {
  const layer = useRef<HTMLDivElement>(null);
  const [finding, setFinding] = useState(false);
  const moved = movedToMore(useLayerWidth(layer));
  const chainMoved = moved.includes('chain');
  const zoomReason = props.listing ? NO_ZOOM : props.noScene ? NOTHING : undefined;
  const unavailable = (reason: string | undefined): { unavailable?: string } => (reason === undefined ? {} : { unavailable: reason });
  // ONE Open button (step 8.4b, E1): a family selected, "Open family"; an arrow selected, "Open reactions". It lives in the Selected bar.
  const arrow = props.arrowOpen;
  const open = arrow === undefined ? { label: 'Open family', onSelect: props.onOpenFamily, reason: props.noScene ? NOTHING : props.openReason } : { label: 'Open reactions', onSelect: arrow.onOpen, reason: arrow.unavailable };
  const more: MenuItem[] = [
    { id: 'list', label: props.listing ? 'Show the map' : 'List', onSelect: props.onToggleList },
    ...(chainMoved ? [{ id: 'chain', label: 'From A to B', onSelect: props.onToggleChain, ...unavailable(props.noScene ? NOTHING : undefined) }] : []),
    ...(props.unanchored === undefined ? [] : [{ id: 'unanchored', label: `Unanchored reactions (${props.unanchored.count})`, onSelect: props.unanchored.onToggle, ...unavailable(props.unanchored.reason) }]),
  ];
  const words = props.scene === null || props.selected === null || props.multi ? undefined : selectionWordsOf(props.scene, props.selected, 'corner');
  return (
    <div className={styles.layer} ref={layer} role="toolbar" aria-label="Canvas tools" data-map-toolbar="" inert={props.inert}>
      <div className={styles.top}>
        <div className={styles.bar} data-map-control="bar">
          <span className={styles.chapterBox}>
            <ChapterSelect chapters={props.chapters} value={props.chapterId} onChange={props.onChapter} />
          </span>
          {finding ? (
            <Suspense fallback={<input className={controls.findBox} disabled aria-label="Loading" />}>
              <FindFamily
                families={props.families}
                autoFocus
                onChoose={(id) => {
                  props.onFind(id);
                  setFinding(false);
                }}
                onClose={() => setFinding(false)}
              />
            </Suspense>
          ) : (
            <IconButton label="Find a family" icon="search" variant="default" className={styles.barButton} onClick={() => setFinding(true)} />
          )}
          {chainMoved ? null : (
            <Button aria-pressed={props.chainOpen} onClick={props.onToggleChain} {...unavailable(props.noScene ? NOTHING : undefined)}>
              From A to B
            </Button>
          )}
          <Menu label="More" items={more} />
          {props.extra}
        </div>
        <MapHint
          selected={words === undefined ? undefined : `Selected: ${words}`}
          onClear={props.onClear}
          onZoom={props.onZoomSelection}
          zoomName={words}
          hint={props.hint}
          hintKind={props.hintKind}
          open={words === undefined ? undefined : <Button onClick={open.onSelect} {...unavailable(open.reason)}>{open.label}</Button>}
        />
      </div>
      <div className={styles.zoom} role="group" aria-label="Zoom" data-map-control="stack">
        <IconButton label="Zoom in" icon="plus" variant="default" className={styles.zoomButton} onClick={props.onZoomIn} {...unavailable(zoomReason)} />
        <IconButton label="Zoom out" icon="minus" variant="default" className={styles.zoomButton} onClick={props.onZoomOut} {...unavailable(zoomReason)} />
        <span className={styles.separator} aria-hidden="true" />
        <IconButton label="Fit" icon="scan" variant="default" className={styles.zoomButton} onClick={props.onFit} {...unavailable(zoomReason)} />
      </div>
      <div className={styles.keyStrip} data-map-control="bar" data-key-wrap="">
        <ArrowKey keys={props.keys} />
        <Button aria-expanded={props.keyOpen} aria-haspopup="dialog" onClick={props.onToggleKey} data-key-button="">
          <Icon name="info" size={16} /> Key
        </Button>
        {props.keyOpen ? props.keyPopover : null}
      </div>
    </div>
  );
}
