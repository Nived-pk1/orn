/**
 * The phone shell's own parts (ADR-039, UI_ARCHITECTURE §13): the search and More buttons of the slim top bar, the More menu (File items,
 * Exam scope, Dataset counts, About this preview, Status), the folded notices line and the one-line alert. Composition only; every word
 * of a notice still comes from `banners.ts`.
 */
import { useState } from 'react';
import type { RecordKind } from '@/core/schema';
import { useSubscribable } from '@/ui/hooks';
import { Button, Dialog, ErrorBoundary, IconButton, ToastItems, useToastView } from '@/ui/primitives';
import { bannersOf, bootLinesOf } from './banners';
import { useApp } from './context';
import { ExamScopeSelector, type ExamScopeBinding } from './exam-scope-selector';
import { alertOf } from './phone-alert';
import { RecordCounts } from './record-counts';
import { fileItems, type FileBinding } from './top-bar';
import { NavigatorStatus } from '@/features/navigator';
import { PanelsStatus } from './panels-status';
import { BootLines, Banners, StatusLine } from './status-parts';
import { usePanels } from '@/ui/state';
import styles from './phone-parts.module.css';

export function PhoneBar(props: {
  readonly onSearch: () => void;
  readonly file: FileBinding;
  readonly exam: ExamScopeBinding;
  readonly counts: Readonly<Record<RecordKind, number>>;
  readonly onStatus: () => void;
}) {
  const [more, setMore] = useState(false);
  // a choice that opens another dialog closes this one first (two modal dialogs are never open together)
  const then = (run: () => void) => (): void => {
    setMore(false);
    run();
  };
  return (
    <>
      <IconButton label="Search" icon="search" onClick={props.onSearch} />
      <Button onClick={() => setMore(true)} aria-haspopup="dialog">
        More
      </Button>
      <Dialog open={more} onClose={() => setMore(false)} title="More">
        <section aria-label="File" className={styles.section}>
          <h3>File</h3>
          <ul className={styles.list}>
            {fileItems(props.file).map((item) => (
              <li key={item.id}>
                <Button
                  className={styles.wide}
                  {...(item.unavailable === undefined ? { onClick: then(() => item.onSelect?.()) } : { unavailable: item.unavailable })}
                >
                  {item.label}
                </Button>
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="Exam scope" className={styles.section}>
          <h3>Exam scope</h3>
          <ExamScopeSelector binding={props.exam} />
        </section>
        <section aria-label="Dataset" className={styles.section}>
          <h3>Dataset</h3>
          <RecordCounts counts={props.counts} />
        </section>
        <section aria-label="Status" className={styles.section}>
          <Button className={styles.wide} onClick={then(props.onStatus)}>
            Status
          </Button>
        </section>
      </Dialog>
    </>
  );
}

/** The notices fold into ONE line that expands on tap (the Phase 8 openItem for narrow screens). */
export function PhoneNotices() {
  const { services, panels } = useApp();
  const status = useSubscribable(services.status);
  const storageNoticeDismissed = usePanels(panels, (s) => s.storageNoticeDismissed);
  const [open, setOpen] = useState(false);
  // the toasts (the import notice, the storage warning...) are counted and listed here on a phone; none floats over the cards
  const toastCount = useToastView()?.items.length ?? 0;
  const count = bannersOf(status, { storageNoticeDismissed }).length + bootLinesOf(status.notices).length + toastCount;
  if (count === 0) return null;
  return (
    <div className={styles.notices}>
      <Button variant="quiet" className={styles.noticesButton} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {count === 1 ? '1 notice' : `${count} notices`}
      </Button>
      {open ? (
        <ErrorBoundary label="The notices panel">
          <Banners />
          <BootLines />
          <ToastItems />
        </ErrorBoundary>
      ) : null}
    </div>
  );
}

/** The one-line alert (nothing when nothing needs the user); a tap opens Status. */
export function PhoneAlert(props: { readonly onStatus: () => void }) {
  const { services } = useApp();
  const text = alertOf(useSubscribable(services.status));
  if (text === null) return null;
  return (
    <button type="button" className={styles.alert} onClick={props.onStatus}>
      {text}
    </button>
  );
}

/** Everything the desktop status bar says, in a dialog (the More menu's Status and a tap on the alert open it). */
export function PhoneStatusDialog(props: { readonly open: boolean; readonly onClose: () => void }) {
  return (
    <Dialog open={props.open} onClose={props.onClose} title="Status">
      <ErrorBoundary label="The status panel">
        <StatusLine />
        <PanelsStatus />
        <NavigatorStatus />
      </ErrorBoundary>
    </Dialog>
  );
}
