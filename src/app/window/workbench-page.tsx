/**
 * The Workbench page (step 6.2a decision D5): where authoring starts on the desktop. "New species" opens the editor on a blank species;
 * "New class" and "New reagent" are listed and unavailable until step 6.2b (never hidden, never a silent no-op); the drafts list shows
 * every unfinished edit with a way back into it. Writer tab only: a read-only tab says why on each button.
 */
import { shortTime } from '@/features/workbench';
import { Button } from '@/ui/primitives';
import { useDraftsView, useEditors } from './drafts-ui';
import styles from './window.module.css';

const LATER = 'Arrives in step 6.2b';

export function WorkbenchPage() {
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
        <Button unavailable={LATER}>New class</Button>
        <Button unavailable={LATER}>New reagent</Button>
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
                {item.name} ({item.kind}, {item.isNew ? 'new' : 'edit'}, last changed {shortTime(item.updatedAt)}){item.changedSince ? ', the record changed since' : ''}{' '}
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
