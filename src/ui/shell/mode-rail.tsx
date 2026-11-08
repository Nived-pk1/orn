import { Button, Count, Icon, IconButton, Tooltip, VisuallyHidden, type IconName } from '@/ui/primitives';
import styles from './mode-rail.module.css';

export interface ModeItem {
  readonly id: string;
  readonly label: string;
  /** Why the mode cannot be opened yet, as the phase or step that brings it (E8). Absent: it exists and is enabled. */
  readonly unavailable?: string;
  /** The icon drawn before the label (and alone when the rail is collapsed). Absent: no icon. */
  readonly icon?: IconName;
  /** The group the view sits in: "Study" (the default) or "Author" (Studio only). */
  readonly group?: 'study' | 'author';
  /** A count the app already shows for this view (Review); absent: none. */
  readonly count?: number;
}

export interface ModeRailProps {
  readonly modes: readonly ModeItem[];
  readonly active: string;
  readonly onChange: (id: string) => void;
  /** The rail is collapsed to icons (56 px); the labels stay as the buttons' names and tooltips. */
  readonly collapsed?: boolean;
  /** A Collapse / Expand button at the foot of the rail. Absent: none. */
  readonly onCollapse?: (collapsed: boolean) => void;
}

const GROUPS: readonly { readonly id: 'study' | 'author'; readonly label: string }[] = [
  { id: 'study', label: 'Study' },
  { id: 'author', label: 'Author' },
];

function ModeButton(props: { readonly mode: ModeItem; readonly current: boolean; readonly collapsed: boolean; readonly onChange: (id: string) => void }) {
  const { mode, current, collapsed } = props;
  const count = mode.count === undefined || mode.count <= 0 ? null : <Count value={mode.count} className={styles.count} />;
  const button = (
    <Button
      variant="quiet"
      className={styles.modeButton}
      aria-current={current ? 'page' : undefined}
      {...(mode.unavailable === undefined ? { onClick: () => props.onChange(mode.id) } : { unavailable: `not available yet: ${mode.unavailable}` })}
    >
      {mode.icon === undefined ? null : <Icon name={mode.icon} />}
      {collapsed ? <VisuallyHidden>{mode.label}</VisuallyHidden> : <span className={styles.modeLabel}>{mode.label}</span>}
      {mode.unavailable === undefined || collapsed ? null : <span className={styles.phase}>{mode.unavailable}</span>}
      {collapsed ? null : count}
    </Button>
  );
  // collapsed to icons: the label is the tooltip (hover and focus) as well as the button's name
  return collapsed ? <Tooltip content={mode.label}>{button}</Tooltip> : button;
}

/** The mode rail: views in groups, each with its icon; what exists is enabled, what does not exist yet is listed, disabled, with the phase that brings it. */
export function ModeRail(props: ModeRailProps) {
  const collapsed = props.collapsed === true;
  return (
    <nav className={styles.rail} aria-label="Modes">
      <div className={styles.groups}>
        {GROUPS.map((group) => {
          const items = props.modes.filter((mode) => (mode.group ?? 'study') === group.id);
          if (items.length === 0) return null;
          return (
            <div key={group.id} role="group" aria-label={group.label} className={styles.group}>
              {collapsed ? <hr className={styles.groupRule} /> : <p className={styles.groupLabel} aria-hidden="true">{group.label}</p>}
              <ul className={styles.modes}>
                {items.map((mode) => (
                  <li key={mode.id} className={styles.mode}>
                    <ModeButton mode={mode} current={mode.id === props.active && mode.unavailable === undefined} collapsed={collapsed} onChange={props.onChange} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {props.onCollapse === undefined ? null : collapsed ? (
        <IconButton label="Expand" icon="chevron-right" className={styles.railToggle} onClick={() => props.onCollapse?.(false)} />
      ) : (
        <Button variant="quiet" className={styles.railCollapse} onClick={() => props.onCollapse?.(true)}>
          <span className={styles.flip}>
            <Icon name="chevron-right" />
          </span>
          <span>Collapse</span>
        </Button>
      )}
    </nav>
  );
}
