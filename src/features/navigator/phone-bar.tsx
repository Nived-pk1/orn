/**
 * The phone map's controls row (step 8.2b-fix, E1): the chapter select keeps the room it needs, "Find a family" is a 44 px search button, and
 * pressing it opens the text box over the whole row (Esc or the close button puts the row back), and "From A to B". The box is a lazy chunk.
 */
import { lazy, Suspense, useState } from 'react';
import { ChapterSelect, type ChapterOption } from './chapter-select';
import type { NamedFamily } from './find-family-match';
import controls from './map-controls.module.css';
import styles from './phone-map.module.css';

const FindFamily = /* @__PURE__ */ lazy(() => import('./find-family').then((m) => ({ default: m.FindFamily })));

export interface PhoneMapBarProps {
  readonly chapters: readonly ChapterOption[];
  readonly chapterId: string | null;
  readonly onChapter: (id: string | null) => void;
  readonly families: readonly NamedFamily[];
  readonly onFind: (id: string) => void;
  readonly chainOpen: boolean;
  readonly onToggleChain: () => void;
}

export function PhoneMapBar(props: PhoneMapBarProps) {
  const [finding, setFinding] = useState(false);
  if (finding) {
    return (
      <div className={`${styles.phoneBar} ${styles.phoneBarFinding}`} data-phone-map-bar="" data-map-control="bar">
        <Suspense fallback={<input className={controls.findBox} data-phone="" disabled aria-label="Loading" />}>
          <FindFamily
            families={props.families}
            phone
            autoFocus
            onChoose={(id) => {
              props.onFind(id);
              setFinding(false);
            }}
            onClose={() => setFinding(false)}
          />
        </Suspense>
      </div>
    );
  }
  return (
    <div className={styles.phoneBar} data-phone-map-bar="" data-map-control="bar">
      <ChapterSelect chapters={props.chapters} value={props.chapterId} onChange={props.onChapter} phone />
      <button type="button" className={controls.iconButton} data-icon-button="" aria-label="Find a family" onClick={() => setFinding(true)}>
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
          <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M13 13l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <button type="button" className={controls.phoneButton} aria-pressed={props.chainOpen} onClick={props.onToggleChain}>
        From A to B
      </button>
    </div>
  );
}
