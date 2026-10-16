/**
 * The shell frame of UI_ARCHITECTURE §2 (step 5.2). PRESENTATIONAL: every region is filled through props and the frame knows nothing
 * about the app's status, stores or chemistry. Regions: top bar, mode rail, banners, canvas, inspector, status bar. Breakpoints:
 * from 1280 px three panes (inspector 360-520 px, resizable, its open state persisted by the caller); 900-1279 px the inspector is an
 * overlay drawer; below 900 px one pane, the inspector a bottom sheet and the mode rail a bottom bar. The CSS decides the layout; the
 * breakpoint is read here only to know which open state a toggle changes (the persisted pane or the session's drawer).
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useLayoutMode } from '@/ui/hooks';
import { IconButton, openLayers } from '@/ui/primitives';
import { ModeRail, type ModeItem } from './mode-rail';
import { PhoneSheet } from './phone-sheet';
import { ResizeHandle } from './resize-handle';
import styles from './shell.module.css';
import { useBreakpoint } from './use-breakpoint';

export interface InspectorPane {
  readonly width: number;
  readonly min: number;
  readonly max: number;
  /** The pane's open state at the wide breakpoint (persisted by the caller). */
  readonly open: boolean;
  readonly onWidth: (width: number) => void;
  readonly onOpen: (open: boolean) => void;
}

export interface ShellProps {
  readonly title: string;
  /** False: the title is a plain line, not the page's h1 (a screen whose own content carries the h1, as the family page does). */
  readonly titleHeading?: boolean;
  /** Controls at the right of the top bar (menus, undo and redo, search ...). */
  readonly topBar: ReactNode;
  readonly modes: readonly ModeItem[];
  readonly activeMode: string;
  readonly onModeChange: (id: string) => void;
  readonly banners: ReactNode;
  readonly canvas: ReactNode;
  readonly inspectorTitle: string;
  readonly inspector: ReactNode;
  readonly pane: InspectorPane;
  /** A number that goes up each time something asks for the inspector below the wide breakpoint (the drawer or sheet opens). */
  readonly openRequest?: number;
  /** A number that goes up when the page asks for the focus to go to its title (the first-run screen closed: the button that had it is gone). */
  readonly focusTitleRequest?: number;
  readonly statusBar: ReactNode;
  /** The phone layout's own regions (ADR-039): used instead of the top bar controls, the banners, the mode rail and the status bar when the layout mode is phone. */
  readonly phone?: PhoneRegions;
}

export interface PhoneRegions {
  /** Controls at the right of the slim top bar (search, More). */
  readonly bar: ReactNode;
  /** The folded notices line. */
  readonly notices: ReactNode;
  /** The one-line alert (empty when nothing needs the user). */
  readonly alert: ReactNode;
  /** The bottom tab bar (part 4). */
  readonly tabs?: ReactNode;
}

export function Shell(props: ShellProps) {
  const breakpoint = useBreakpoint();
  const layout = useLayoutMode();
  const phone = layout === 'phone' && props.phone !== undefined ? props.phone : undefined;
  const { pane } = props;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const wide = breakpoint === 'wide';
  const requested = props.openRequest ?? 0;
  const seen = useRef(requested);
  useEffect(() => {
    if (seen.current === requested) return;
    seen.current = requested;
    setDrawerOpen(true);
  }, [requested]);
  const title = useRef<HTMLHeadingElement>(null);
  const titleRequested = props.focusTitleRequest ?? 0;
  const titleSeen = useRef(titleRequested);
  useEffect(() => {
    if (titleSeen.current === titleRequested) return;
    titleSeen.current = titleRequested;
    title.current?.focus();
  }, [titleRequested]);
  const inspectorOpen = wide ? pane.open : drawerOpen;
  const toggle = (): void => (wide ? pane.onOpen(!pane.open) : setDrawerOpen((open) => !open));
  const edge = useCallback(() => frame.current?.getBoundingClientRect().right ?? null, []);
  // Esc in the drawer or the sheet closes it, unless a menu or a dialog is open above it (the topmost layer takes Esc).
  const escape = (event: KeyboardEvent<HTMLElement>): void => {
    if (!wide && event.key === 'Escape' && !event.defaultPrevented && openLayers() === 0) setDrawerOpen(false);
  };
  return (
    <div
      ref={frame}
      className={styles.shell}
      data-breakpoint={breakpoint}
      data-layout={phone === undefined ? 'desktop' : 'phone'}
      data-inspector={inspectorOpen ? 'open' : 'closed'}
      style={{ ['--inspector-width' as string]: `${pane.width}px` }}
    >
      <header className={styles.topBar}>
        {props.titleHeading === false ? (
          <p className={styles.title}>{phone === undefined ? props.title : 'ORN'}</p>
        ) : (
          <h1 ref={title} tabIndex={-1} className={styles.title} {...(phone === undefined ? {} : { 'aria-label': props.title })}>{phone === undefined ? props.title : 'ORN'}</h1>
        )}
        {phone === undefined ? (
          <>
            <div className={styles.topControls}>{props.topBar}</div>
            <IconButton
              label={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
              icon="inspector"
              aria-pressed={inspectorOpen}
              onClick={toggle}
            />
          </>
        ) : (
          <div className={styles.topControls}>{phone.bar}</div>
        )}
      </header>
      {phone === undefined ? <ModeRail modes={props.modes} active={props.activeMode} onChange={props.onModeChange} /> : null}
      <div className={styles.banners}>{phone === undefined ? props.banners : phone.notices}</div>
      <main className={styles.canvas}>{props.canvas}</main>
      {wide && pane.open ? <ResizeHandle width={pane.width} min={pane.min} max={pane.max} onWidth={pane.onWidth} edge={edge} /> : null}
      {phone === undefined ? (
        <aside className={styles.inspector} aria-label={props.inspectorTitle} hidden={!inspectorOpen} onKeyDown={escape}>
          <div className={styles.inspectorHeader}>
            <h2 className={styles.inspectorTitle}>{props.inspectorTitle}</h2>
            {wide ? null : <IconButton label="Close inspector" icon="close" onClick={() => setDrawerOpen(false)} />}
          </div>
          <div className={styles.inspectorBody}>{props.inspector}</div>
        </aside>
      ) : (
        <PhoneSheet title={props.inspectorTitle} openRequest={requested}>
          {props.inspector}
        </PhoneSheet>
      )}
      {phone?.tabs ?? null}
      {phone === undefined ? <footer className={styles.statusBar} tabIndex={0}>{props.statusBar}</footer> : <div className={styles.phoneAlert}>{phone.alert}</div>}
    </div>
  );
}
