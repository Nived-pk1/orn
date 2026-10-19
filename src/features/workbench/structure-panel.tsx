/**
 * The structure panel (ADR-010 / UI_ARCHITECTURE §8, step 6.2a part 3): a SMILES / CXSMILES / molfile text field (Plex Mono), a debounced
 * parse in the chem worker (400 ms), the drawing in the current Structures mode and the DERIVED formula, charge and stereo facts shown
 * BESIDE the entered values. Nothing derived is written without the explicit "Use derived formula" button (one undoable edit). A text
 * over the limit is refused in the field with the limit in words and never cut. Its own component so the 6.2b editors reuse it; it holds
 * no chemistry: the worker reads the structure and this file shows the answer.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { StructureFacts } from '@/chem/contracts';
import type { DraftRecipe } from '@/core/editing';
import type { StructureRep } from '@/core/schema';
import { createDepictionBinding, drawingFailed, useRetryingDepiction, useStructureMode } from '@/render/svg';
import { Button } from '@/ui/primitives';
import { FormulaText } from './formula-text';
import type { StructurePort } from './structure-contracts';
import { limitProblem, setStructureText, structureViewOf, setDerivedFormula, type StructureSlot } from './structure-model';
import styles from './structure-panel.module.css';

export const STRUCTURE_PARSE_DEBOUNCE_MS = 400;
const DRAWING_AREA = { width: 256, height: 160 } as const;

type Reading =
  | { readonly state: 'none' }
  | { readonly state: 'reading' }
  | { readonly state: 'read'; readonly structure: StructureRep; readonly facts: StructureFacts }
  | { readonly state: 'unreadable'; readonly message: string }
  | { readonly state: 'unanswered'; readonly message: string };

export interface StructurePanelProps {
  readonly draft: unknown;
  readonly onEdit: (recipe: DraftRecipe, path?: string) => void;
  readonly port: StructurePort;
  readonly timers: { after(ms: number, run: () => void): () => void };
  readonly invalid?: ReadonlySet<string>;
  readonly unavailable?: string;
  readonly phone?: boolean;
  /** `generic`: a class's R-labelled structure (`generic.structure`): drawn, nothing derived, no facts table, no formula button. */
  readonly slot?: StructureSlot;
}

function stereoLine(facts: StructureFacts): string {
  const parts: string[] = [];
  if (facts.specifiedStereocentres !== undefined || facts.unspecifiedStereocentres !== undefined) {
    parts.push(`${facts.specifiedStereocentres ?? 0} stereocentres specified, ${facts.unspecifiedStereocentres ?? 0} unspecified`);
  }
  const cip = facts.cipCounts;
  if (cip !== undefined) {
    const labels = (['R', 'S', 'r', 's', 'E', 'Z'] as const).filter((key) => cip[key] > 0).map((key) => `${cip[key]} ${key}`);
    if (labels.length > 0) parts.push(`CIP ${labels.join(', ')}`);
  }
  if (facts.hasDoubleBondStereo === true) parts.push('double-bond geometry set');
  return parts.length === 0 ? 'no stereochemistry' : parts.join('; ');
}

function Drawing(props: { readonly structure: StructureRep; readonly port: StructurePort; readonly timers: StructurePanelProps['timers']; readonly alt: string }) {
  const { port, timers } = props;
  const binding = useMemo(() => (port.depictions === undefined ? undefined : createDepictionBinding(port.depictions, timers, DRAWING_AREA)), [port, timers]);
  useStructureMode(port.depictions);
  const key = binding?.keyOf(props.structure);
  const status = useRetryingDepiction(binding?.manager, key, timers);
  if (status.state === 'ready') {
    return (
      <div className={styles.tile}>
        <img className={styles.drawing} src={status.url} alt={props.alt} />
      </div>
    );
  }
  return (
    <p className={styles.hint} role="status">
      {drawingFailed(status) ? 'The structure could not be drawn.' : binding === undefined ? 'No drawing is available here.' : 'Drawing the structure...'}
    </p>
  );
}

export function StructurePanel(props: StructurePanelProps) {
  const { draft, onEdit, port, timers, unavailable } = props;
  const slot = props.slot ?? 'species';
  const generic = slot === 'generic';
  const fieldPath = generic ? 'generic.structure' : 'structure';
  const textId = generic ? 'generic-structure-text' : 'structure-text';
  const view = structureViewOf(draft, slot);
  const [typed, setTyped] = useState(view.text);
  const [refusal, setRefusal] = useState<string | undefined>(undefined);
  const [reading, setReading] = useState<Reading>(view.structure === undefined ? { state: 'none' } : { state: 'reading' });
  const version = useRef(0);
  // the draft's text changed from outside the field (undo, redo, a conflict choice): the field follows it
  useEffect(() => {
    if (refusal === undefined) setTyped(view.text);
  }, [view.text, refusal]);

  const structure = view.structure;
  const structureKey = structure === undefined ? '' : `${structure.format}\u0000${structure.value}`;
  useEffect(() => {
    version.current += 1;
    const mine = version.current;
    if (structure === undefined) {
      setReading({ state: 'none' });
      return undefined;
    }
    setReading((was) => (was.state === 'read' ? was : { state: 'reading' }));
    return timers.after(STRUCTURE_PARSE_DEBOUNCE_MS, () => {
      void port.parse(structure).then((outcome) => {
        if (mine !== version.current) return; // an answer for an older text is dropped
        if (outcome.ok) setReading({ state: 'read', structure, facts: outcome.facts });
        else if (outcome.reason === 'invalid') setReading({ state: 'unreadable', message: outcome.error });
        else setReading({ state: 'unanswered', message: outcome.error });
      });
    });
    // `structureKey` stands for the structure's text and format
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey, port, timers]);

  const change = (text: string): void => {
    setTyped(text);
    const problem = limitProblem(text);
    setRefusal(problem);
    if (problem === undefined) onEdit(setStructureText(text, slot), fieldPath);
  };
  const facts = reading.state === 'read' ? reading.facts : undefined;
  const bad = props.invalid?.has(fieldPath) === true || refusal !== undefined;
  const derived = facts?.formula;
  const same = derived !== undefined && derived === view.formula;

  return (
    <div className={props.phone === true ? `${styles.panel} ${styles.phone}` : styles.panel}>
      <div className={styles.field}>
        <label htmlFor={textId}>{generic ? 'R-labelled CXSMILES or molfile' : 'SMILES, CXSMILES or molfile'}</label>
        <textarea
          id={textId}
          className={styles.text}
          value={typed}
          rows={view.structure?.format === 'molfile' || typed.includes('\n') ? 8 : 3}
          readOnly={unavailable !== undefined}
          aria-invalid={bad ? true : undefined}
          aria-describedby={refusal === undefined ? undefined : `${textId}-refusal`}
          data-field-path={fieldPath}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => change(event.target.value)}
        />
        {refusal === undefined ? null : (
          <p id={`${textId}-refusal`} className={styles.refusal} role="alert">
            {refusal}
          </p>
        )}
      </div>
      {reading.state === 'reading' ? <p className={styles.hint} role="status">Reading the structure...</p> : null}
      {reading.state === 'unreadable' ? (
        <p className={styles.refusal} role="alert">
          The chemistry engine could not read this structure: {reading.message}
        </p>
      ) : null}
      {reading.state === 'unanswered' ? (
        <p className={styles.hint} role="status">
          The chemistry engine did not answer, so the structure was not read: {reading.message}
        </p>
      ) : null}
      {reading.state === 'read' ? <Drawing structure={reading.structure} port={port} timers={timers} alt={generic ? 'Drawing of the generic structure' : 'Drawing of the entered structure'} /> : null}
      {generic && reading.state === 'read' ? <p className={styles.hint}>The R labels are drawn as written. No formula is derived from a generic structure.</p> : null}
      {facts === undefined || generic ? null : (
        <table className={styles.facts} aria-label="Entered and derived values">
          <thead>
            <tr>
              <th scope="col">Fact</th>
              <th scope="col">Entered</th>
              <th scope="col">Derived from the structure</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Formula</th>
              <td data-label="Entered">{view.formula === undefined ? 'not entered' : <FormulaText formula={view.formula} />}</td>
              <td data-label="Derived from the structure">
                {derived === undefined ? 'not available' : <FormulaText formula={derived} />}{' '}
                {derived === undefined || same ? null : (
                  <Button {...(unavailable !== undefined ? { unavailable } : { onClick: () => onEdit(setDerivedFormula(derived)) })}>Use derived formula</Button>
                )}
              </td>
            </tr>
            <tr>
              <th scope="row">Charge</th>
              <td data-label="Entered">{view.charge === undefined ? 'not entered' : view.charge}</td>
              <td data-label="Derived from the structure">{facts.charge ?? 'not available'}</td>
            </tr>
            <tr>
              <th scope="row">Stereo</th>
              <td data-label="Entered">{view.stereoKind === undefined ? 'not entered' : `${view.stereoKind}${view.descriptors.length === 0 ? '' : ` (${view.descriptors.join(', ')})`}`}</td>
              <td data-label="Derived from the structure">{stereoLine(facts)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
