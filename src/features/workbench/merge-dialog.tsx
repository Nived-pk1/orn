/**
 * The merge dialog (ADR-040 addendum "Delete and merge", step 6.8a, D3): A is merged INTO B, B survives. The preview comes from the port
 * (the core's, plus the structure check of a species): each scalar field where the two differ shows both values with B's selected first
 * ("Keep ..." / "Take ..."), the records that will change are listed, and a refusal is said in words with Merge unavailable. Nothing changes
 * before Merge, which is one step in the history. Text nodes only.
 */
import { useEffect, useState } from 'react';
import type { RecordRef } from '@/core/schema';
import { Button, Dialog } from '@/ui/primitives';
import type { MergePick, MergePort, MergeView } from './merge-contracts';
import styles from './editor.module.css';

const SHOWN_MAX = 120;

/** A value as words: text as it is, nothing as "(nothing)", anything else as compact JSON; cut past 120 characters. */
export function valueWords(value: unknown): string {
  if (value === undefined || value === '') return '(nothing)';
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? '(nothing)');
  return text.length > SHOWN_MAX ? `${text.slice(0, SHOWN_MAX)}...` : text;
}

export interface MergeDialogProps {
  readonly port: MergePort;
  /** The record being merged away (stored, or a draft that was never stored). */
  readonly from: unknown;
  readonly into: RecordRef;
  readonly intoName: string;
  /** The record being merged has edits that are not saved yet: they are part of the merge, and the dialog says so. */
  readonly unsaved?: boolean;
  readonly onDone: (into: RecordRef) => void;
  readonly onClose: () => void;
}

export function MergeDialog(props: MergeDialogProps) {
  const { port, from, into } = props;
  const [view, setView] = useState<MergeView | null>(null);
  const [picks, setPicks] = useState<Readonly<Record<string, MergePick>>>({});
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void port.preview(from, into).then((answer) => {
      if (!live) return;
      setView(answer);
      if (answer.ok) setPicks(Object.fromEntries(answer.scalars.map((one) => [one.path, 'keep' as const])));
    });
    return () => {
      live = false;
    };
  }, [port, from, into]);

  const run = (): void => {
    setBusy(true);
    void port.run(from, into, picks).then((result) => {
      setBusy(false);
      if (result.ok) props.onDone(into);
      else setMessage(result.message);
    });
  };
  const off = view === null ? 'looking' : view.ok ? (busy ? 'merging' : undefined) : view.message;
  const footer = (
    <div className={styles.footer}>
      <Button variant="primary" {...(off !== undefined ? { unavailable: off } : { onClick: run })}>
        Merge
      </Button>
      <Button onClick={props.onClose}>Cancel</Button>
    </div>
  );
  return (
    <Dialog open onClose={props.onClose} title={`Merge into ${props.intoName}`} size="wide" footer={footer}>
      <p>{`The record you merge is deleted and ${props.intoName} is kept. Its names are added to ${props.intoName}'s aliases, and everything that pointed at it points at ${props.intoName}.`}</p>
      {props.unsaved === true ? <p>Includes your unsaved changes</p> : null}
      {view === null ? <p role="status">Looking at what would change...</p> : null}
      {view !== null && !view.ok ? <p role="status">{view.message}</p> : null}
      {view !== null && view.ok ? (
        <>
          {view.scalars.length === 0 ? <p>No field differs: nothing to choose.</p> : <p>Where the two differ, choose which value stays.</p>}
          {view.scalars.map((one) => (
            <fieldset key={one.path} className={styles.field} role="group" aria-label={one.words}>
              <legend>{one.words}</legend>
              {(['keep', 'take'] as const).map((pick) => (
                <label key={pick}>
                  <input type="radio" name={`merge-${one.path}`} checked={(picks[one.path] ?? 'keep') === pick} onChange={() => setPicks((was) => ({ ...was, [one.path]: pick }))} />{' '}
                  {pick === 'keep' ? `Keep ${valueWords(one.into)}` : `Take ${valueWords(one.from)}`}
                </label>
              ))}
            </fieldset>
          ))}
          {view.filled.length === 0 ? null : (
            <>
              <h3>{`Filled in from ${view.fromName} (the record being merged)`}</h3>
              <ul aria-label={`Filled in from ${view.fromName} (the record being merged)`} className={styles.matches}>
                {view.filled.map((one) => (
                  <li key={one.path}>{`${one.words}: ${valueWords(one.value)}`}</li>
                ))}
              </ul>
            </>
          )}
          <h3>Records that will change</h3>
          <ul aria-label="Records that will change" className={styles.matches}>
            {view.changes.map((change) => (
              <li key={`${change.ref.kind}:${change.ref.id}`}>{change.name}</li>
            ))}
          </ul>
          {view.deleted === undefined ? null : <p>{`${view.deleted.name} is deleted in the same step. One Undo brings everything back.`}</p>}
        </>
      ) : null}
      {message === undefined ? null : <p role="alert">{message}</p>}
    </Dialog>
  );
}
