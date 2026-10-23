/**
 * The delete dialog (ADR-040 addendum "Delete and merge", step 6.8a, D1): what a delete will do, BEFORE it does it. Three lists from the
 * reference registry's policies - "Removed from" (the link goes), "Deleted with it" (the record goes too), "Blocks the delete" (Delete is
 * unavailable until none is left) - the first 10 of each with "Show all <n>", and how many [[links]] are left as they are. The core computed
 * the view; this only shows it. Text nodes only.
 */
import { useState } from 'react';
import type { DeleteRow, DeleteView } from '@/core/editing';
import type { RecordRef } from '@/core/schema';
import { Button, Dialog } from '@/ui/primitives';
import { kindWords } from './form-kinds';
import styles from './editor.module.css';

export const DELETE_LIST_SHOWN = 10;

function Rows(props: { readonly label: string; readonly rows: readonly DeleteRow[]; readonly onOpen?: (ref: RecordRef) => void }) {
  const [all, setAll] = useState(false);
  if (props.rows.length === 0) return null;
  const shown = all ? props.rows : props.rows.slice(0, DELETE_LIST_SHOWN);
  return (
    <section aria-label={props.label}>
      <h3>{props.label}</h3>
      <ul className={styles.matches} aria-label={props.label}>
        {shown.map((row) => (
          <li key={`${row.ref.kind}:${row.ref.id}`} className={styles.match}>
            <span>
              <strong>{row.name}</strong> ({kindWords(row.ref.kind)}){row.fields.length === 0 ? '' : ` — ${row.fields.join(', ')}`}
            </span>
            {props.onOpen === undefined ? null : (
              <Button aria-label={`Open ${row.name}`} onClick={() => props.onOpen?.(row.ref)}>
                Open
              </Button>
            )}
          </li>
        ))}
      </ul>
      {all || props.rows.length <= DELETE_LIST_SHOWN ? null : <Button onClick={() => setAll(true)}>{`Show all ${props.rows.length}`}</Button>}
    </section>
  );
}

export interface DeleteDialogProps {
  readonly view: DeleteView;
  /** Why deleting cannot happen in this tab (read-only); undefined when it can. */
  readonly reason?: string | undefined;
  /** The store's refusal, in words, after Delete was tried. */
  readonly message?: string | undefined;
  readonly busy?: boolean;
  readonly onDelete: () => void;
  readonly onOpen: (ref: RecordRef) => void;
  readonly onClose: () => void;
}

export function DeleteDialog(props: DeleteDialogProps) {
  const { view } = props;
  const name = view.targets.length === 1 ? (view.targets[0]?.name ?? 'this record') : `${view.targets.length} records`;
  const nothing = view.removedFrom.length === 0 && view.deletedWith.length === 0 && view.blocks.length === 0;
  const blocked = 'It cannot be deleted until none of them uses it: open each one and change it, or delete it first.';
  const off = props.reason ?? (view.canDelete ? undefined : blocked);
  const footer = (
    <div className={styles.footer}>
      <Button variant="primary" {...(off !== undefined ? { unavailable: off } : props.busy === true ? { unavailable: 'deleting' } : { onClick: props.onDelete })}>
        Delete
      </Button>
      <Button onClick={props.onClose}>Cancel</Button>
    </div>
  );
  return (
    <Dialog open onClose={props.onClose} title={`Delete ${name}?`} size="wide" footer={footer}>
      {view.targets.length < 2 ? null : <Rows label="Records to delete" rows={view.targets.map((target) => ({ ref: target.ref, name: target.name, fields: [] }))} />}
      <Rows label="Removed from" rows={view.removedFrom} />
      <Rows label="Deleted with it" rows={view.deletedWith} />
      <Rows label="Blocks the delete" rows={view.blocks} onOpen={props.onOpen} />
      {nothing ? <p>Nothing else changes.</p> : null}
      {view.canDelete ? null : <p role="status">{blocked}</p>}
      {props.reason === undefined ? null : <p role="status">{props.reason}</p>}
      {view.softLinks === 0 ? null : (
        <p className={styles.hint}>
          {view.softLinks === 1
            ? '1 link in the text of another record stays as it is and shows as a missing record (REF-008).'
            : `${view.softLinks} links in the text of other records stay as they are and show as a missing record (REF-008).`}
        </p>
      )}
      <p className={styles.hint}>One Undo brings everything back. A picture&apos;s stored file is never deleted here.</p>
      {props.message === undefined ? null : <p role="alert">{props.message}</p>}
    </Dialog>
  );
}
