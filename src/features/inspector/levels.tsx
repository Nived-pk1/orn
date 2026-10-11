/**
 * The levels of the inspector (UI_ARCHITECTURE §9, step 5.6a). L1 is always shown by the view; L2 to L5 are sections with a heading
 * that opens and closes. Which are open when a record is shown comes from the deepest level the user has opened (saved in the panels
 * entry of `uiState`; L2 the first time); opening a deeper level saves it. Closed sections are not rendered, so a long record costs
 * nothing until it is opened.
 */
import { useId, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { InspectorLevel } from '@/ui/state';
import { useInspectorEnv } from './env';
import styles from './inspector.module.css';

export function LevelSection(props: { readonly level: InspectorLevel; readonly title: string; readonly children: ReactNode; readonly forceOpen?: boolean }) {
  const env = useInspectorEnv();
  const { panels } = env.ports.ui;
  const deepest = useStore(panels, (s) => s.inspectorLevel);
  // The default comes from the saved level at the moment a record is shown (the parent keys this tree by record).
  const [open, setOpen] = useState(props.forceOpen === true || props.level <= deepest);
  const headingId = useId();
  const bodyId = useId();
  return (
    <section className={styles.level} aria-labelledby={headingId} data-level={props.level}>
      <h3 id={headingId} className={styles.levelHeading}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => {
            if (!open) panels.getState().openInspectorLevel(props.level);
            setOpen(!open);
          }}
        >
          <span aria-hidden="true">{open ? '▾' : '▸'}</span> Level {props.level}: {props.title}
        </button>
      </h3>
      <div id={bodyId} className={styles.levelBody} hidden={!open}>
        {open ? props.children : null}
      </div>
    </section>
  );
}

export function Facts(props: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{props.label}</dt>
      <dd>{props.children}</dd>
    </div>
  );
}

export const FactList = (props: { readonly label: string; readonly children: ReactNode }) => (
  <dl className={styles.facts} aria-label={props.label}>
    {props.children}
  </dl>
);
