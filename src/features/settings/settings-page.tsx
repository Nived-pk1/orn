/**
 * The Settings page (step 8.4f, D1; the reference's page pattern: section label, title, grouped list rows with a one-line explanation and the
 * control at the right, 760 px wide). Appearance (Theme, Reduce motion), Your exam (the app's exam menu, handed in as `exam`) and Your data
 * (Back up, the app's own backup action). No Text size and no Density yet (REVIEW REQUIRED in PROGRESS). The page holds no chemistry and no
 * storage: the appearance store and the two actions arrive as props.
 */
import type { ReactNode } from 'react';
import { useStore } from 'zustand';
import { Button, SegmentedControl } from '@/ui/primitives';
import type { AppearanceStore, Theme } from '@/ui/state';
import styles from './settings-page.module.css';

const THEME_OPTIONS: readonly { readonly value: Theme; readonly label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
];

function Row(props: { readonly title: string; readonly why: string; readonly children: ReactNode; readonly id: string }) {
  return (
    <li className={styles.row}>
      <div className={styles.text}>
        <p className={styles.rowTitle} id={`${props.id}-title`}>{props.title}</p>
        <p className={styles.rowWhy} id={`${props.id}-why`}>{props.why}</p>
      </div>
      <div className={styles.control}>{props.children}</div>
    </li>
  );
}

export function SettingsPage(props: { readonly appearance: AppearanceStore; readonly exam: ReactNode; readonly onBackUp?: () => void }) {
  const { appearance } = props;
  const theme = useStore(appearance, (s) => s.theme);
  const reduceMotion = useStore(appearance, (s) => s.reduceMotion);
  const persistence = useStore(appearance, (s) => s.persistence.kind);
  return (
    <article className={styles.page} aria-label="Settings">
      <p className={styles.label}>App</p>
      <h1 className={styles.title}>Settings</h1>
      <section aria-labelledby="settings-appearance" className={styles.group}>
        <h2 id="settings-appearance" className={styles.groupTitle}>Appearance</h2>
        <ul className={styles.rows}>
          <Row id="theme" title="Theme" why="System follows your device's light or dark setting.">
            <SegmentedControl label="Theme" options={THEME_OPTIONS} value={theme} onChange={(value) => appearance.getState().setTheme(value)} />
          </Row>
          <Row id="motion" title="Reduce motion" why="Turns off slides and fades. Off follows your device's setting.">
            <label className={styles.switch}>
              <input type="checkbox" role="switch" aria-label="Reduce motion" checked={reduceMotion} onChange={(event) => appearance.getState().setReduceMotion(event.target.checked)} />
              <span className={styles.track} aria-hidden="true" />
            </label>
          </Row>
        </ul>
        {persistence === 'saved' ? null : <p className={styles.note}>{persistence === 'save_failed' ? 'These choices could not be saved; they apply until you close this page.' : 'These choices are kept for this session only.'}</p>}
      </section>
      {props.exam === null ? null : (
        <section aria-labelledby="settings-exam" className={styles.group}>
          <h2 id="settings-exam" className={styles.groupTitle}>Your exam</h2>
          <ul className={styles.rows}>
            <Row id="exam" title="Exam" why="Every page shows the records of this exam. Change it any time.">
              {props.exam}
            </Row>
          </ul>
        </section>
      )}
      {props.onBackUp === undefined ? null : (
        <section aria-labelledby="settings-data" className={styles.group}>
          <h2 id="settings-data" className={styles.groupTitle}>Your data</h2>
          <ul className={styles.rows}>
            <Row id="backup" title="Back up" why="Saves a copy of your data as a file you keep.">
              <Button onClick={props.onBackUp}>Back up</Button>
            </Row>
          </ul>
        </section>
      )}
    </article>
  );
}
