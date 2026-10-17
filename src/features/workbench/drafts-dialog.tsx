/**
 * The drafts list (ADR-040, step 6.1a part 3): every unfinished draft with its record name, kind and edit time, "Open" and "Discard".
 * Discard asks first and says it cannot be undone. A draft whose record changed since it was started says so. A stored row that could not
 * be read is listed as such with Discard (it is never deleted without the user). Text nodes only; nothing here is chemistry.
 */
import { useState, useSyncExternalStore } from 'react';
import { Button, Dialog } from '@/ui/primitives';
import type { DraftsListPort, DraftListItemView, UnreadableDraftView } from './contracts';
import { shortTime } from './draft-text';
import styles from './drafts-dialog.module.css';

export interface DraftsDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly port: DraftsListPort;
  /** Opens a draft in its editor. Absent: Open is unavailable with `openUnavailable` as the reason. */
  readonly onOpenDraft?: (id: string) => void;
  readonly openUnavailable?: string;
}

function Row(props: {
  readonly item: DraftListItemView | UnreadableDraftView;
  readonly asking: boolean;
  readonly onAsk: () => void;
  readonly onCancel: () => void;
  readonly onDiscard: () => void;
  readonly onOpen: (() => void) | undefined;
  readonly openUnavailable: string | undefined;
}) {
  const { item, asking } = props;
  return (
    <li className={styles.item}>
      {item.unreadable ? (
        <>
          <strong>1 draft could not be read</strong>
          <p className={styles.meta}>{item.reason}</p>
        </>
      ) : (
        <>
          <strong>{item.name}</strong>
          <p className={styles.meta}>
            {item.kind}
            {item.isNew ? ' (new record)' : ''} · edited {shortTime(item.updatedAt)}
          </p>
          {item.changedSince ? <p className={styles.note}>The record changed since this draft was started.</p> : null}
        </>
      )}
      {asking ? (
        <div className={styles.actions} role="group" aria-label="Discard this draft?">
          <span>Discard this draft? It cannot be undone.</span>
          <Button variant="primary" onClick={props.onDiscard}>
            Discard
          </Button>
          <Button onClick={props.onCancel}>Keep it</Button>
        </div>
      ) : (
        <div className={styles.actions}>
          {item.unreadable ? null : (
            <Button {...(props.onOpen === undefined ? { unavailable: props.openUnavailable ?? 'this draft cannot be opened now' } : { onClick: props.onOpen })}>Open</Button>
          )}
          <Button onClick={props.onAsk}>Discard</Button>
        </div>
      )}
    </li>
  );
}

export function DraftsDialog(props: DraftsDialogProps) {
  const { port } = props;
  const view = useSyncExternalStore(port.subscribe, port.view);
  const [asking, setAsking] = useState<string | null>(null);
  return (
    <Dialog open={props.open} onClose={props.onClose} title="Drafts" footer={<Button onClick={props.onClose}>Close</Button>}>
      {view.items.length === 0 ? (
        <p>No unfinished drafts.</p>
      ) : (
        <ul className={styles.list} aria-label="Unfinished drafts">
          {view.items.map((item) => (
            <Row
              key={item.id}
              item={item}
              asking={asking === item.id}
              onAsk={() => setAsking(item.id)}
              onCancel={() => setAsking(null)}
              onDiscard={() => {
                setAsking(null);
                void (item.unreadable ? port.discardUnreadable(item.id) : port.discard(item.id));
              }}
              onOpen={props.onOpenDraft === undefined || item.unreadable ? undefined : () => props.onOpenDraft?.(item.id)}
              openUnavailable={props.openUnavailable}
            />
          ))}
        </ul>
      )}
    </Dialog>
  );
}
