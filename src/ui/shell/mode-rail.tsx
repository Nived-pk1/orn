import { Button } from '@/ui/primitives';
import styles from './shell.module.css';

export interface ModeItem {
  readonly id: string;
  readonly label: string;
  /** Why the mode cannot be opened yet, as the phase or step that brings it (E8). Absent: it exists and is enabled. */
  readonly unavailable?: string;
}

export interface ModeRailProps {
  readonly modes: readonly ModeItem[];
  readonly active: string;
  readonly onChange: (id: string) => void;
}

/** The mode rail: what exists is enabled; what does not exist yet is listed, disabled, with the phase that brings it. */
export function ModeRail(props: ModeRailProps) {
  return (
    <nav className={styles.rail} aria-label="Modes">
      <ul className={styles.modes}>
        {props.modes.map((mode) => {
          const current = mode.id === props.active && mode.unavailable === undefined;
          return (
            <li key={mode.id} className={styles.mode}>
              <Button
                variant="quiet"
                className={styles.modeButton}
                aria-current={current ? 'page' : undefined}
                {...(mode.unavailable === undefined ? { onClick: () => props.onChange(mode.id) } : { unavailable: `not available yet: ${mode.unavailable}` })}
              >
                <span>{mode.label}</span>
                {mode.unavailable === undefined ? null : <span className={styles.phase}>{mode.unavailable}</span>}
              </Button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
