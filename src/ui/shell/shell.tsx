/**
 * The shell frame of UI_ARCHITECTURE §2 (step 5.2). PRESENTATIONAL: every region is filled through props and the frame knows nothing
 * about the app's status, stores or chemistry. Regions: top bar, mode rail, banners, canvas, inspector, status bar. Breakpoints:
 * from 1280 px three panes (inspector 360-520 px, resizable, its open state persisted by the caller); 900-1279 px the inspector is an
 * overlay drawer; below 900 px one pane, the inspector a bottom sheet and the mode rail a bottom bar. The CSS decides the layout; the
 * breakpoint is read here only to know which open state a toggle changes (the persisted pane or the session's drawer).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useLayoutMode } from '@/ui/hooks';
import { IconButton, openLayers } from '@/ui/primitives';
import { ModeRail, type ModeItem } from './mode-rail';
import { PhoneSheet, type SheetHeight } from './phone-sheet';
import { ResizeHandle } from './resize-handle';
import './landscape.css';
import marker from './edition-marker.module.css';
import styles from './shell.module.css';
import { AppMark, Breadcrumb, CommandBox, type ShellCrumb } from './top-bar-parts';
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
  /** A short word beside the title (the Studio edition's name); absent: none. The shell knows no edition: the window says it. */
  readonly marker?: string | undefined;
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
  /** The same for closing the phone's sheet (a main action in it moved the page). */
  readonly closeRequest?: number;
  /** A number that goes up when the page asks for the focus to go to its title (the first-run screen closed: the button that had it is gone). */
  readonly focusTitleRequest?: number;
  /** The status bar's content; undefined: no status bar at all (no footer, no reserved row; step 8.3, C1). */
  readonly statusBar?: ReactNode;
  /** The toast dock: docked at the foot of the main column (step 8.4a, Part C), never over the inspector. */
  readonly toasts?: ReactNode;
  /** A toast is showing: pages keep room below their last item (the map's key band is already free). */
  readonly toastShowing?: boolean;
  /** The phone sheet's height changed (the window folds a floating toast into the notices row while a sheet is open). */
  readonly onSheetHeight?: (height: SheetHeight) => void;
  /** The list of views at the left is collapsed to icons (56 px; step 8.4d: replaces the 8.4a "Hide"); the caller remembers it. */
  /** Full map is on (step 8.4e, Part D): the frame parts (top bar, rail, notices, status bar, tab bar) are hidden by the lazy full-map stylesheet. */
  readonly fullMap?: boolean;
  readonly railCollapsed?: boolean;
  readonly onRailCollapsed?: (collapsed: boolean) => void;
  /** Where the reader is: the view, then the record (the desktop breadcrumb; the phone shows the view's name). */
  readonly crumb?: ShellCrumb;
  /** The search / command box in the middle of the desktop bar (a click opens the palette). Absent: none. */
  readonly commandBox?: { readonly onOpen: () => void };
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
  const railCollapsed = props.railCollapsed === true && phone === undefined;
  const main = useRef<HTMLElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sheetSpace, setSheetSpace] = useState(0);
  const frame = useRef<HTMLDivElement>(null);
  const wide = breakpoint === 'wide';
  const requested = props.openRequest ?? 0;
  const seen = useRef(requested);
  // A phone toast floats above the storage line and the tab bar, wherever they are: the distance from the bottom of the page area to the bottom of the screen
  // is published as `--phone-bottom-space` (step 8.4b, G2); the toast region reads it.
  const onPhone = phone !== undefined;
  useLayoutEffect(() => {
    const root = frame.current;
    if (!onPhone || root === null) return undefined;
    const publish = (): void => {
      const page = root.querySelector('main');
      if (page === null) return;
      document.documentElement.style.setProperty('--phone-bottom-space', `${Math.max(0, Math.round(window.innerHeight - page.getBoundingClientRect().bottom))}px`);
    };
    publish();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(publish);
    observer?.observe(root);
    const page = root.querySelector('main');
    if (page !== null) observer?.observe(page); // the storage line appearing or leaving changes the page area, not the shell
    window.addEventListener('resize', publish);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', publish);
      document.documentElement.style.removeProperty('--phone-bottom-space');
    };
  }, [onPhone]);
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
      {...(props.statusBar === undefined ? { 'data-status-bar': 'none' } : {})}
      data-inspector={inspectorOpen ? 'open' : 'closed'}
      {...(railCollapsed ? { 'data-rail': 'collapsed' } : {})}
      {...(props.fullMap === true ? { 'data-full-map': '' } : {})}
      {...(props.toastShowing === true ? { 'data-toast': '' } : {})}
      {...(phone !== undefined && sheetSpace > 0 ? { 'data-sheet-room': '' } : {})}
      style={{ ['--inspector-width' as string]: `${pane.width}px`, ['--sheet-space' as string]: `${sheetSpace}px` }}
    >
      <a
        href="#main-content"
        className={styles.skip}
        onClick={(event) => {
          event.preventDefault();
          main.current?.focus();
        }}
      >
        Skip to content
      </a>
      <header className={styles.topBar}>
        <AppMark />
        {props.titleHeading === false ? (
          <p className={phone === undefined ? styles.srOnly : styles.title}>{phone === undefined ? props.title : (props.crumb?.section ?? 'ORN')}</p>
        ) : (
          <h1 ref={title} tabIndex={-1} className={phone === undefined ? styles.srOnly : styles.title} {...(phone === undefined ? {} : { 'aria-label': props.title })}>
            {phone === undefined ? props.title : (props.crumb?.section ?? 'ORN')}
          </h1>
        )}
        {props.marker === undefined ? null : (
          <span className={marker.marker} data-edition-marker="">
            {props.marker}
          </span>
        )}
        {phone === undefined && props.crumb !== undefined ? <Breadcrumb crumb={props.crumb} /> : null}
        {phone === undefined ? (
          <>
            <div className={styles.barSpace}>{props.commandBox === undefined ? null : <CommandBox onOpen={props.commandBox.onOpen} />}</div>
            <div className={styles.topControls}>{props.topBar}</div>
            <IconButton
              label={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
              icon="panel-right"
              aria-pressed={inspectorOpen}
              onClick={toggle}
            />
          </>
        ) : (
          <div className={styles.topControls}>{phone.bar}</div>
        )}
      </header>
      {phone === undefined ? <ModeRail modes={props.modes} active={props.activeMode} onChange={props.onModeChange} collapsed={railCollapsed} {...(props.onRailCollapsed === undefined ? {} : { onCollapse: props.onRailCollapsed })} /> : null}
      <div className={styles.banners}>{phone === undefined ? props.banners : phone.notices}</div>
      <div className={styles.main}>
        <main ref={main} id="main-content" tabIndex={-1} className={styles.canvas}>
          {props.canvas}
        </main>
        {phone === undefined && props.toasts !== undefined ? <div className={styles.toastDock}>{props.toasts}</div> : null}
      </div>
      {wide && pane.open ? <ResizeHandle width={pane.width} min={pane.min} max={pane.max} onWidth={pane.onWidth} edge={edge} /> : null}
      {phone === undefined ? (
        <aside className={styles.inspector} aria-label={props.inspectorTitle} hidden={!inspectorOpen} onKeyDown={escape}>
          <div className={styles.inspectorHeader}>
            <h2 className={styles.inspectorTitle}>{props.inspectorTitle}</h2>
            <IconButton label="Close inspector" icon="x" onClick={() => (wide ? pane.onOpen(false) : setDrawerOpen(false))} />
          </div>
          <div className={styles.inspectorBody}>{props.inspector}</div>
        </aside>
      ) : (
        <PhoneSheet title={props.inspectorTitle} openRequest={requested} closeRequest={props.closeRequest ?? 0} onSpace={setSheetSpace} {...(props.onSheetHeight === undefined ? {} : { onHeight: props.onSheetHeight })}>
          {props.inspector}
        </PhoneSheet>
      )}
      {phone?.tabs ?? null}
      {phone === undefined ? (props.statusBar === undefined ? null : <footer className={styles.statusBar} tabIndex={0}>{props.statusBar}</footer>) : <div className={styles.phoneAlert}>{phone.alert}</div>}
    </div>
  );
}
