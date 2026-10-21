/**
 * The phone shell's own parts (ADR-039, UI_ARCHITECTURE §13): the search and More buttons of the slim top bar, the More menu (File items,
 * Exam scope, Dataset counts, About this preview, Status), the folded notices line and the one-line alert. Composition only; every word
 * of a notice still comes from `banners.ts`.
 */
import { useState, useSyncExternalStore } from 'react';
import type { RecordKind } from '@/core/schema';
import { useSubscribable } from '@/ui/hooks';
import { Button, Dialog, ErrorBoundary, IconButton, ToastItems, useToastView, useToasts } from '@/ui/primitives';
import { bannersOf, bootLinesOf, draftsLineOf } from './banners';
import { useApp } from './context';
import { EDITING } from '@/app/edition';
import { StudyUpdateNotice, useStudyUpdateDue } from './study-update';
import { useDraftsView, useEditors } from './editors-access';
import { ExamScopeSelector, type ExamScopeBinding } from './exam-scope-selector';
import { alertOf } from './phone-alert';
import { RecordCounts } from './record-counts';
import { fileItems, historyLabelOf, historyReason, historySnapshot, stepHistory, useFileWithDrafts, type FileBinding, type HistoryBinding } from './top-bar';
import { NavigatorStatus, StructuresControl, type NavigatorStructures } from '@/features/navigator';
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
  /** The store's history: Undo and Redo are in More on a phone, never on the bar (authoring is desktop-first, ADR-039 addendum). */
  readonly history?: HistoryBinding;
  /** The Structures setting (equation step, part 4): a control in More. Absent: none. */
  readonly structures?: NavigatorStructures;
}) {
  const [more, setMore] = useState(false);
  const file = useFileWithDrafts(props.file);
  const editors = useEditors();
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
            {fileItems(file).map((item) => (
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
        {!EDITING || editors === null ? null : (
          <section aria-label="Workbench" className={styles.section}>
            <h3>Workbench</h3>
            <Button className={styles.wide} {...(editors.editReason === undefined ? { onClick: then(editors.newSpecies) } : { unavailable: editors.editReason })}>
              New species
            </Button>
            <Button className={styles.wide} {...(editors.editReason === undefined ? { onClick: then(editors.newClass) } : { unavailable: editors.editReason })}>
              New class
            </Button>
            <Button className={styles.wide} {...(editors.editReason === undefined ? { onClick: then(editors.newReagent) } : { unavailable: editors.editReason })}>
              New reagent
            </Button>
            <Button className={styles.wide} {...(editors.editReason === undefined ? { onClick: then(editors.newReaction) } : { unavailable: editors.editReason })}>
              New reaction
            </Button>
            <Button className={styles.wide} {...(editors.editReason === undefined ? { onClick: then(editors.newMechanism) } : { unavailable: editors.editReason })}>
              New mechanism
            </Button>
            <Button className={styles.wide} {...(editors.editReason === undefined ? { onClick: then(editors.newSource) } : { unavailable: editors.editReason })}>
              New source
            </Button>
            <Button className={styles.wide} {...(editors.editReason === undefined ? { onClick: then(editors.newConcept) } : { unavailable: editors.editReason })}>
              New concept
            </Button>
            <Button className={styles.wide} {...(editors.editReason === undefined ? { onClick: then(editors.newNamedReaction) } : { unavailable: editors.editReason })}>
              New named reaction
            </Button>
            <Button className={styles.wide} {...(editors.editReason === undefined ? { onClick: then(editors.newTransformation) } : { unavailable: editors.editReason })}>
              New transformation
            </Button>
            <Button className={styles.wide} {...(editors.editReason === undefined ? { onClick: then(editors.newRelationship) } : { unavailable: editors.editReason })}>
              New relationship
            </Button>
            <Button className={styles.wide} {...(editors.editReason === undefined ? { onClick: then(editors.newCaveat) } : { unavailable: editors.editReason })}>
              New caveat
            </Button>
            <Button className={styles.wide} {...(editors.editReason === undefined ? { onClick: then(editors.newTopic) } : { unavailable: editors.editReason })}>
              New topic
            </Button>
            <Button className={styles.wide} {...(editors.editReason === undefined ? { onClick: then(editors.newTopicMapping) } : { unavailable: editors.editReason })}>
              New topic mapping
            </Button>
            <Button className={styles.wide} {...(editors.editReason === undefined ? { onClick: then(editors.newExamRelevance) } : { unavailable: editors.editReason })}>
              New exam relevance
            </Button>
            <Button className={styles.wide} {...(editors.editReason === undefined ? { onClick: then(editors.newMapFamily) } : { unavailable: editors.editReason })}>
              New map family
            </Button>
          </section>
        )}
        {props.history === undefined ? null : <HistorySection history={props.history} />}
        {props.structures === undefined ? null : (
          <section aria-label="Structures" className={styles.section}>
            <h3>Structures</h3>
            <StructuresControl structures={props.structures} />
          </section>
        )}
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

/** More > History: "Undo <label>" and "Redo <label>", each unavailable with its reason when there is nothing to do or the tab is read-only. */
function HistorySection(props: { readonly history: HistoryBinding }) {
  const { history } = props;
  const toasts = useToasts();
  useSyncExternalStore((onChange) => history.subscribe(onChange), () => historySnapshot(history));
  const reasons = { undo: historyReason(history, 'undo'), redo: historyReason(history, 'redo') };
  return (
    <section aria-label="History" className={styles.section}>
      <h3>History</h3>
      <ul className={styles.list}>
        {(['undo', 'redo'] as const).map((direction) => (
          <li key={direction}>
            <Button className={styles.wide} {...(reasons[direction] === undefined ? { onClick: () => stepHistory(history, direction, toasts) } : { unavailable: reasons[direction] as string })}>
              {historyLabelOf(history, direction)}
            </Button>
          </li>
        ))}
      </ul>
    </section>
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
  const draftsCount = draftsLineOf(useDraftsView().count) === null ? 0 : 1;
  const updateCount = useStudyUpdateDue() ? 1 : 0;
  const count = bannersOf(status, { storageNoticeDismissed }).length + bootLinesOf(status.notices).length + draftsCount + updateCount + toastCount;
  if (count === 0) return null;
  return (
    <div className={styles.notices}>
      <Button variant="quiet" className={styles.noticesButton} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {count === 1 ? '1 notice' : `${count} notices`}
      </Button>
      {open ? (
        <ErrorBoundary label="The notices panel">
          <Banners />
          <StudyUpdateNotice />
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
