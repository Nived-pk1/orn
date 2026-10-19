/**
 * The Workbench page (step 6.2a decision D5): where authoring starts on the desktop. "New species" opens the editor on a blank species;
 * "New class" opens it on a blank class (step 6.2b); "New reagent" opens it on a blank reagent (step 6.2b); a read-only tab says why on every button (never hidden, never a silent no-op); the drafts list shows
 * every unfinished edit with a way back into it. Writer tab only: a read-only tab says why on each button.
 */
import { Button } from '@/ui/primitives';
import { useApp } from './context';
import { useDraftsView, useEditors } from './drafts-ui';
import { createLocalTimeFormatter } from './local-time';
import styles from './window.module.css';

const machineTime = createLocalTimeFormatter();

export function WorkbenchPage() {
  const formatTime = useApp().formatTime ?? machineTime;
  const editors = useEditors();
  const drafts = useDraftsView();
  const reason = editors === null ? 'Editing is not available here.' : editors.editReason;
  return (
    <section aria-label="Workbench">
      <h2>Workbench</h2>
      <p>Add or change records. Everything you save can be undone.</p>
      <div className={styles.actionRow}>
        <Button variant="primary" {...(reason === undefined && editors !== null ? { onClick: editors.newSpecies } : { unavailable: reason ?? 'Editing is not available here.' })}>
          New species
        </Button>
        <Button {...(reason === undefined && editors !== null ? { onClick: editors.newClass } : { unavailable: reason ?? 'Editing is not available here.' })}>New class</Button>
        <Button {...(reason === undefined && editors !== null ? { onClick: editors.newReagent } : { unavailable: reason ?? 'Editing is not available here.' })}>New reagent</Button>
      </div>
      <h3>Drafts</h3>
      {drafts.items.length === 0 ? (
        <p>No unfinished drafts.</p>
      ) : (
        <ul aria-label="Drafts">
          {drafts.items.map((item) =>
            item.unreadable ? (
              <li key={item.id}>An unreadable draft: {item.reason}</li>
            ) : (
              <li key={item.id}>
                {item.name} ({item.kind}, {item.isNew ? 'new' : 'edit'}, last changed {formatTime(item.updatedAt)}){item.changedSince ? ', the record changed since' : ''}{' '}
                <Button aria-label={`Continue ${item.name}`} {...(editors === null ? { unavailable: 'Editing is not available here.' } : { onClick: () => editors.openDraft(item.id) })}>
                  Continue
                </Button>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
