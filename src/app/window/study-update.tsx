/**
 * The study dataset update notice (studio step E4, ADR-041). STUDY only: when the build ships a published dataset whose sha256 differs from
 * the one this browser last loaded (kept in `uiState`), a notice says so: "Load it" runs the existing replace import (replace_all, its
 * pre-import snapshot, Undo import), "Later" hides it for this visit and it is asked again at the next one. It is not shown in an empty
 * dataset (the first-run screen already offers the dataset) and never in Studio: the owner's working copy is never replaced by a prompt.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { EDITING } from '@/app/edition';
import { Banner, Button } from '@/ui/primitives';
import { studyUpdateDue, useDatasetInfo } from './dataset-info';
import styles from './status-parts.module.css';

interface StudyUpdate {
  readonly due: boolean;
  loadIt(): void;
  later(): void;
}
const NONE: StudyUpdate = { due: false, loadIt: () => undefined, later: () => undefined };
const StudyUpdateContext = createContext<StudyUpdate>(NONE);

export const NOTICE_TEXT = 'A newer version of the study dataset is available. Load it (this replaces the data in this browser; export a backup first if you imported your own data).';

export function StudyUpdateProvider(props: { readonly load: () => void; readonly hasData: boolean; readonly children: ReactNode }) {
  const dataset = useDatasetInfo();
  const [dismissed, setDismissed] = useState(false);
  const { load, hasData } = props;
  const value = useMemo<StudyUpdate>(
    () => ({ due: studyUpdateDue({ editing: EDITING, dataset, hasData, dismissed }), loadIt: load, later: () => setDismissed(true) }),
    [dataset, hasData, dismissed, load],
  );
  return <StudyUpdateContext.Provider value={value}>{props.children}</StudyUpdateContext.Provider>;
}

export const useStudyUpdateDue = (): boolean => useContext(StudyUpdateContext).due;

export function StudyUpdateNotice() {
  const { due, loadIt, later } = useContext(StudyUpdateContext);
  if (!due) return null;
  return (
    <section aria-label="Study dataset update">
      <ul className={styles.list}>
        <li>
          <Banner
            kind="info"
            actions={
              <>
                <Button onClick={loadIt}>Load it</Button>
                <Button onClick={later}>Later</Button>
              </>
            }
          >
            {NOTICE_TEXT}
          </Banner>
        </li>
      </ul>
    </section>
  );
}
