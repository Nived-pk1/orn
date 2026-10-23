/**
 * "Merge into..." (step 6.8a, D3): the record to KEEP is chosen among records of the SAME kind by name, then the merge dialog shows what
 * changes. With the record to keep already given (the duplicate dialog's match) the dialog opens at once. Text nodes only.
 */
import { useState } from 'react';
import type { RecordRef } from '@/core/schema';
import { Button, Dialog } from '@/ui/primitives';
import type { MergeCandidate, MergePort } from './merge-contracts';
import { MergeDialog } from './merge-dialog';
import styles from './editor.module.css';

export interface MergeFlowProps {
  readonly port: MergePort;
  readonly kind: RecordRef['kind'];
  /** The kind in words ("species", "source"). */
  readonly kindWords: string;
  /** The record being merged away: stored, or a draft. */
  readonly from: unknown;
  readonly exceptId: string;
  readonly into?: MergeCandidate;
  readonly onDone: (into: RecordRef) => void;
  readonly onClose: () => void;
}

export function MergeFlow(props: MergeFlowProps) {
  const [chosen, setChosen] = useState<MergeCandidate | undefined>(props.into);
  const [text, setText] = useState('');
  if (chosen !== undefined) return <MergeDialog port={props.port} from={props.from} into={chosen.ref} intoName={chosen.name} onDone={props.onDone} onClose={props.onClose} />;
  const found = text.trim() === '' ? [] : props.port.candidates(props.kind, text, props.exceptId);
  return (
    <Dialog open onClose={props.onClose} title="Merge into..." footer={<Button onClick={props.onClose}>Cancel</Button>}>
      <p>{`Choose the ${props.kindWords} to keep. This one is deleted and everything that pointed at it points at the one you choose.`}</p>
      <label>
        {`Search for the ${props.kindWords} to keep`}
        <input type="text" value={text} onChange={(event) => setText(event.target.value)} autoComplete="off" spellCheck={false} />
      </label>
      {text.trim() !== '' && found.length === 0 ? <p className={styles.hint}>{`No ${props.kindWords} found.`}</p> : null}
      <ul aria-label="Records to keep" className={styles.matches}>
        {found.map((one) => (
          <li key={one.ref.id} className={styles.match}>
            <span>{one.name}</span>
            <Button aria-label={`Merge into ${one.name}`} onClick={() => setChosen(one)}>
              Merge into this
            </Button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/** The merge as the editor shows it (step 6.8a): when it is done the draft has nothing left to say - it is discarded - and the record that was kept is shown. */
export function EditorMerge(props: {
  readonly port: MergePort;
  readonly kind: RecordRef['kind'];
  readonly kindWords: string;
  readonly draft: unknown;
  readonly into: MergeCandidate | undefined;
  /** Ends this editor on purpose (marks it closing, discards the draft); resolves when the draft is gone. */
  readonly leave: () => Promise<void>;
  readonly show: (ref: RecordRef) => void;
  readonly onCancel: () => void;
  readonly onMerged: () => void;
}) {
  return (
    <MergeFlow
      port={props.port}
      kind={props.kind}
      kindWords={props.kindWords}
      from={props.draft}
      exceptId={(props.draft as { id?: string } | undefined)?.id ?? ''}
      {...(props.into === undefined ? {} : { into: props.into })}
      onDone={(into) => {
        void props.leave().then(() => {
          props.onMerged();
          props.show(into);
        });
      }}
      onClose={props.onCancel}
    />
  );
}
