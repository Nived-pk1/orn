/**
 * The shell frame of UI_ARCHITECTURE §2 (step 5.2). PRESENTATIONAL: every region is filled through props and the frame knows nothing
 * about the app's status, stores or chemistry. Regions: top bar, mode rail, banners, canvas, inspector, status bar. Breakpoints:
 * from 1280 px three panes (inspector 360-520 px, resizable, its open state persisted by the caller); 900-1279 px the inspector is an
 * overlay drawer; below 900 px one pane, the inspector a bottom sheet and the mode rail a bottom bar. The CSS decides the layout; the
 * breakpoint is read here only to know which open state a toggle changes (the persisted pane or the session's drawer).
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { IconButton, openLayers } from '@/ui/primitives';
import { ModeRail, type ModeItem } from './mode-rail';
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
  readonly statusBar: ReactNode;
}

export function Shell(props: ShellProps) {
  const breakpoint = useBreakpoint();
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
      data-inspector={inspectorOpen ? 'open' : 'closed'}
      style={{ ['--inspector-width' as string]: `${pane.width}px` }}
    >
      <header className={styles.topBar}>
        {props.titleHeading === false ? <p className={styles.title}>{props.title}</p> : <h1 className={styles.title}>{props.title}</h1>}
        <div className={styles.topControls}>{props.topBar}</div>
        <IconButton
          label={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
          icon="inspector"
          aria-pressed={inspectorOpen}
          onClick={toggle}
        />
      </header>
      <ModeRail modes={props.modes} active={props.activeMode} onChange={props.onModeChange} />
      <div className={styles.banners}>{props.banners}</div>
      <main className={styles.canvas}>{props.canvas}</main>
      {wide && pane.open ? <ResizeHandle width={pane.width} min={pane.min} max={pane.max} onWidth={pane.onWidth} edge={edge} /> : null}
      <aside className={styles.inspector} aria-label={props.inspectorTitle} hidden={!inspectorOpen} onKeyDown={escape}>
        <div className={styles.inspectorHeader}>
          <h2 className={styles.inspectorTitle}>{props.inspectorTitle}</h2>
          {wide ? null : <IconButton label="Close inspector" icon="close" onClick={() => setDrawerOpen(false)} />}
        </div>
        <div className={styles.inspectorBody}>{props.inspector}</div>
      </aside>
      <footer className={styles.statusBar} tabIndex={0}>{props.statusBar}</footer>
    </div>
  );
}
