/** The Studio status bar's full line (step 8.4a): short words, tooltip, details. A lazy chunk: Study never loads it. */
import { useState } from 'react';
import { useCounts, useSubscribable } from '@/ui/hooks';
import { Tooltip } from '@/ui/primitives';
import { useStudyChrome } from '@/ui/study-chrome';
import { useApp } from './context';
import { LazyStatusDialogs } from './lazy-status-dialogs';
import { createLocalTimeFormatter } from './local-time';
import { shortStatusOf } from './status-short';
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
          {/* the short words are drawn from data-short (CSS content), so the full words are the only text in the page for readers and tests */}
          <span aria-hidden="true" className={styles.shortLine}>
            {bar.map((item) => (
              <span key={item.id} className={styles.shortItem} data-short={item.short} />
            ))}
          </span>
        </button>
      </Tooltip>
      {hasLayoutNotes ? (
        <button type="button" className={styles.barButton} aria-haspopup="dialog" onClick={() => setDetails('layout')}>
          Layout notes (1)
        </button>
      ) : null}
      <ul className={styles.fullText}>
          {bar.map((item) => (
            <li key={item.id}>{item.full}</li>
          ))}
      </ul>
      {details === null ? null : <LazyStatusDialogs kind={details} items={items.map((item) => item.full)} layoutNotice={status.layoutNotice} onClose={() => setDetails(null)} />}
    </section>
  );
}
