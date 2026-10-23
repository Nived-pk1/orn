/**
 * One term of the quick-entry review (step 6.7b, Q4): the typed text and its state - resolved (name and kind), "Which one?" with the
 * candidates, or not found with up to five suggestions and "Create new species / reagent". A SMILES-like term the dataset does not have
 * says "Create new species with this structure". Text only; the resolver decided the state, the buttons only say what the user chose.
 */
import { Button } from '@/ui/primitives';
import type { RecordChoice } from './record-picker-contracts';
import type { TermState } from './quick-resolve';
import styles from './quick-entry.module.css';

export interface QuickTermRowProps {
  readonly text: string;
  readonly state: TermState;
  readonly onChoose: (choice: RecordChoice) => void;
  readonly onCreate: (kind: 'species' | 'reagent', withStructure: boolean) => void;
}

function Candidates(props: { readonly choices: readonly RecordChoice[]; readonly label: string; readonly onChoose: (choice: RecordChoice) => void }) {
  return (
    <ul className={styles.candidates} aria-label={props.label}>
      {props.choices.map((choice) => (
        <li key={`${choice.kind}:${choice.id}`}>
          <Button onClick={() => props.onChoose(choice)}>{`Use ${choice.name} (${choice.kind})`}</Button>
        </li>
      ))}
    </ul>
  );
}

export function QuickTermRow(props: QuickTermRowProps) {
  const { state, text } = props;
  return (
    <li className={styles.term} data-testid="quick-term" data-term={text}>
      <span className={styles.termText}>{text}</span>{' '}
      {state.state === 'loading' ? <span className={styles.hint}>Looking...</span> : null}
      {state.state === 'resolved' ? (
        <span>
          {state.instead === undefined ? `${state.name} · ${state.ref.kind}` : `${state.name} (reagent) · `}
          {state.how === 'structure' ? ' (matched by structure)' : ''}
          {state.instead === undefined ? null : <Button onClick={() => props.onChoose(state.instead as RecordChoice)}>Use the species instead</Button>}
        </span>
      ) : null}
      {state.state === 'which' ? (
        <div>
          <strong>Which one?</strong>
          <Candidates choices={state.candidates} label={`Candidates for ${text}`} onChoose={props.onChoose} />
        </div>
      ) : null}
      {state.state === 'missing' ? (
        <div>
          <strong>Not found</strong>
          {state.structure === 'unanswered' && state.message !== undefined ? <p className={styles.hint}>{state.message}</p> : null}
          {state.suggestions.length > 0 ? <Candidates choices={state.suggestions} label={`Suggestions for ${text}`} onChoose={props.onChoose} /> : null}
          <div className={styles.actions}>
            {state.structure === 'new' ? (
              <Button onClick={() => props.onCreate('species', true)}>Create new species with this structure</Button>
            ) : (
              <>
                <Button onClick={() => props.onCreate('species', false)}>{`Create new species "${text}"`}</Button>
                <Button onClick={() => props.onCreate('reagent', false)}>{`Create new reagent "${text}"`}</Button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </li>
  );
}
