/** The Studio status bar's full line (step 8.4a): short words, tooltip, details. A lazy chunk: Study never loads it. */
import { useState } from 'react';
import { useCounts, useSubscribable } from '@/ui/hooks';
import { Tooltip } from '@/ui/primitives';
import { useStudyChrome } from '@/ui/study-chrome';
import { useApp } from './context';
import { LazyStatusDialogs } from './lazy-status-dialogs';
import { createLocalTimeFormatter } from './local-time';
import { shortStatusOf } from './status-short';
import { StatusWords } from './status-words';
import styles from './full-status.module.css';

const localTime = createLocalTimeFormatter();

export function FullStatusLine() {
  const { services, formatTime } = useApp();
  const chrome = useStudyChrome();
  const status = useSubscribable(services.status);
  const counts = useCounts(services.store.findings);
  const [details, setDetails] = useState<'all' | 'layout' | null>(null);
  const items = shortStatusOf(status, counts, formatTime ?? localTime, status.layoutNotice !== null && chrome.layoutNotice ? 1 : 0);
  const bar = items.filter((item) => item.id !== 'layout_notes');
  const hasLayoutNotes = items.some((item) => item.id === 'layout_notes');
  const everything = items.map((item) => item.full).join('. ');
  return (
    <section aria-label="Status" className={styles.statusRow}>
      <Tooltip content={everything}>
        <button type="button" className={styles.barButton} aria-label="Status details" onClick={() => setDetails('all')}>
          <StatusWords items={bar} />
        </button>
      </Tooltip>
      {hasLayoutNotes ? (
        <button type="button" className={styles.barButton} aria-haspopup="dialog" onClick={() => setDetails('layout')}>
          Layout notes (1)
        </button>
      ) : null}
      {details === null ? null : <LazyStatusDialogs kind={details} items={items.map((item) => item.full)} layoutNotice={status.layoutNotice} onClose={() => setDetails(null)} />}
    </section>
  );
}
