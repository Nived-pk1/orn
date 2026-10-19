/**
 * The duplicate dialog (step 6.2a part 5, decision D4): on Save of a species that may repeat an existing one, each match with its name,
 * formula, drawing and why it matched, and three choices. "Open the existing" keeps the draft as a draft and shows the existing record;
 * "Keep both" goes on with the Save (the store's gate still runs); "Merge" is unavailable ("Merging arrives in step 6.8"). Closing the
 * dialog goes back to the editor. It decides nothing about chemistry: the check was made by the workers.
 */
import { useMemo } from 'react';
import type { StructureRep } from '@/core/schema';
import { createDepictionBinding, drawingFailed, useRetryingDepiction, useStructureMode } from '@/render/svg';
import { Button, Dialog } from '@/ui/primitives';
import type { DuplicateMatch, DuplicateOutcome } from './duplicate-contracts';
import type { StructurePort } from './structure-contracts';
import styles from './editor.module.css';

const AREA = { width: 128, height: 80 } as const;
export const MERGE_LATER = 'Merging arrives in step 6.8';

const WHY: Readonly<Record<DuplicateMatch['reasons'][number], string>> = { name: 'the same name', structure: 'the same structure' };

function Picture(props: { readonly structure: StructureRep; readonly name: string; readonly port: StructurePort | undefined; readonly timers: { after(ms: number, run: () => void): () => void } }) {
  const { port, timers } = props;
  const binding = useMemo(() => (port?.depictions === undefined ? undefined : createDepictionBinding(port.depictions, timers, AREA)), [port, timers]);
  useStructureMode(port?.depictions);
  const key = binding?.keyOf(props.structure);
  const status = useRetryingDepiction(binding?.manager, key, timers);
  if (status.state === 'ready') return <img className={styles.matchDrawing} src={status.url} alt={`Structure of ${props.name}`} />;
  return <span className={styles.hint}>{drawingFailed(status) ? 'The structure could not be drawn.' : binding === undefined ? '' : 'Drawing...'}</span>;
}

export interface DuplicateDialogProps {
  readonly outcome: DuplicateOutcome;
  readonly structure: StructurePort | undefined;
  readonly timers: { after(ms: number, run: () => void): () => void };
  readonly onOpenExisting: (match: DuplicateMatch) => void;
  readonly onKeepBoth: () => void;
  /** Back to the editor. */
  readonly onClose: () => void;
}

export function DuplicateDialog(props: DuplicateDialogProps) {
  const { outcome } = props;
  const footer = (
    <div className={styles.footer}>
      <Button variant="primary" onClick={props.onKeepBoth}>
        Keep both
      </Button>
      <Button unavailable={MERGE_LATER}>Merge</Button>
      <Button onClick={props.onClose}>Back to the editor</Button>
    </div>
  );
  return (
    <Dialog open onClose={props.onClose} title="This may already exist" size="wide" footer={footer}>
      <p>{outcome.matches.length === 1 ? 'A record you already have looks like this one.' : 'Records you already have look like this one.'}</p>
      <ul className={styles.matches} aria-label="Matches">
        {outcome.matches.map((match) => (
          <li key={match.ref.id} className={styles.match}>
            <div>
              <strong>{match.name}</strong>
              {match.qualifier === undefined ? null : <span> {match.qualifier}</span>}
              {match.formula === undefined ? null : <span> · {match.formula}</span>}
              <p className={styles.hint}>Matched by {match.reasons.map((reason) => WHY[reason]).join(' and ')}.</p>
            </div>
            {match.structure === undefined ? null : <Picture structure={match.structure} name={match.name} port={props.structure} timers={props.timers} />}
            <Button aria-label={`Open ${match.name}`} onClick={() => props.onOpenExisting(match)}>
              Open the existing
            </Button>
          </li>
        ))}
      </ul>
      {outcome.more > 0 ? <p className={styles.hint}>{outcome.more} more not listed.</p> : null}
      {outcome.structureChecked ? null : <p role="status">{outcome.message ?? 'Structure duplicates could not be checked'}. Only the names were compared.</p>}
      <p className={styles.hint}>The draft stays a draft when you open the existing record.</p>
    </Dialog>
  );
}
