/**
 * The review under the quick-entry line (step 6.7b, Q4): each term on a line with its state, each stage's condition text with what the
 * condition parser read (those fields need Confirm in the editor) and what it did not, the scope in words (changeable), a similar existing
 * reaction, the live preview drawn with the card's equation component, and "Open in the reaction editor" (available only when every term is
 * resolved). Nothing is saved here. No chemistry: the core decides the scope words, the seed and the conditions.
 */
import { useMemo } from 'react';
import { conditionsFromText } from '@/core/quick-entry/conditions';
import { stageConditionText, type QuickEntry } from '@/core/quick-entry/grammar';
import { quickScope, quickSeed, type QuickRefs, type QuickScope, type TermRef } from '@/core/quick-entry/seed';
import { useLayoutMode } from '@/ui/hooks';
import { Button } from '@/ui/primitives';
import type { QuickEntryPort } from './quick-entry-contracts';
import { QuickTermRow } from './quick-term-row';
import { ReactionPreview } from './reaction-preview';
import type { TermState } from './quick-resolve';
import type { RecordChoice } from './record-picker-contracts';
import styles from './quick-entry.module.css';

const FIELD_WORDS = { temperature: 'temperature', pressure: 'pressure', atmosphere: 'atmosphere', medium: 'medium', phase: 'solvent character', strength: 'strength' } as const;

export interface QuickReviewProps {
  readonly entry: QuickEntry;
  readonly port: QuickEntryPort;
  readonly stateOf: (text: string) => TermState;
  /** What each term resolved to (undefined while it is not), in the order of the entry. */
  readonly refs: QuickRefs;
  readonly onChoose: (text: string, choice: RecordChoice) => void;
  readonly onCreate: (text: string, kind: 'species' | 'reagent', withStructure: boolean) => void;
  readonly scopeChoice: 'specific' | 'generic' | null;
  readonly onScope: (scope: 'specific' | 'generic' | null) => void;
  readonly onOpen: (seed: Readonly<Record<string, unknown>>) => void;
}

function StageConditions(props: { readonly index: number; readonly text: string }) {
  const read = useMemo(() => conditionsFromText(props.text), [props.text]);
  return (
    <div role="group" aria-label={`Conditions of stage ${props.index + 1}`} className={styles.conditions}>
      <span>{`Conditions: ${props.text}`}</span>
      {read.recognised.length > 0 ? (
        <ul>
          {read.recognised.map((piece) => (
            <li key={piece.piece}>{`${piece.piece} → ${FIELD_WORDS[piece.field]} (needs Confirm in the editor)`}</li>
          ))}
        </ul>
      ) : null}
      {read.unrecognised.length > 0 ? <span className={styles.hint}>{`Not recognised (kept as text): ${read.unrecognised.join(', ')}`}</span> : null}
    </div>
  );
}

export function QuickReview(props: QuickReviewProps) {
  const { entry, port, refs } = props;
  const phone = useLayoutMode() === 'phone';
  const all = [...refs.stages.flat(), ...refs.products];
  const auto = quickScope(all);
  const scope: QuickScope = props.scopeChoice ?? auto.scope;
  const previewSeed = useMemo(() => {
    let n = 0;
    return quickSeed({ entry, refs, scope, newId: (prefix) => `${prefix}_quick${(n += 1)}` });
  }, [entry, refs, scope]);
  const similar = previewSeed === undefined ? [] : port.similar(refs.stages.flat() as TermRef[], refs.products as TermRef[]);
  const open = (): void => {
    const seed = quickSeed({ entry, refs, scope, newId: (prefix) => port.newId(prefix) });
    if (seed !== undefined) props.onOpen(seed);
  };
  return (
    <div className={styles.review}>
      {entry.stages.map((stage, s) => (
        <section key={s} aria-label={`Stage ${s + 1}`}>
          <ul className={styles.terms} aria-label={s === 0 ? 'Terms' : `Terms of stage ${s + 1}`}>
            {stage.terms.map((term, t) => (
              <QuickTermRow key={t} text={term.text} state={props.stateOf(term.text)} onChoose={(choice) => props.onChoose(term.text, choice)} onCreate={(kind, withStructure) => props.onCreate(term.text, kind, withStructure)} />
            ))}
          </ul>
          {stageConditionText(stage) === '' ? null : <StageConditions index={s} text={stageConditionText(stage)} />}
        </section>
      ))}
      <section aria-label="Products">
        <ul className={styles.terms} aria-label="Product terms">
          {entry.products.map((term, p) => (
            <QuickTermRow key={p} text={term.text} state={props.stateOf(term.text)} onChoose={(choice) => props.onChoose(term.text, choice)} onCreate={(kind, withStructure) => props.onCreate(term.text, kind, withStructure)} />
          ))}
        </ul>
      </section>
      <div className={styles.scope}>
        <span>Scope</span>
        <select aria-label="Scope" value={props.scopeChoice ?? (auto.scope === 'choose' ? '' : auto.scope)} onChange={(event) => props.onScope(event.target.value === 'specific' || event.target.value === 'generic' ? event.target.value : null)}>
          <option value="">Choose a scope</option>
          <option value="specific">Specific</option>
          <option value="generic">Generic</option>
        </select>
        <span data-testid="quick-scope">{props.scopeChoice === null ? auto.words : `Scope: you chose ${props.scopeChoice}. ${auto.words}`}</span>
      </div>
      {similar.map((one) => (
        <p key={one.id}>
          <span>{`A similar reaction exists: ${one.name}`}</span>{' '}
          <Button aria-label={`Open ${one.name}`} onClick={() => port.openRecord({ kind: 'reaction', id: one.id })}>
            Open
          </Button>
        </p>
      ))}
      {port.preview === undefined ? null : (
        <section aria-label="Preview of the reaction" className={styles.preview}>
          {previewSeed === undefined ? (
            <p className={styles.hint}>The preview appears when every term is resolved.</p>
          ) : (
            <ReactionPreview draft={{ id: 'rxn_quick-entry', reversibility: { kind: 'unknown' }, intermediates: [], ...previewSeed }} port={port.preview} phone={phone} />
          )}
        </section>
      )}
      <div className={styles.actions}>
        <Button variant="primary" {...(previewSeed === undefined ? { unavailable: 'Resolve every term first' } : { onClick: open })}>
          Open in the reaction editor
        </Button>
      </div>
    </div>
  );
}
