/**
 * One term of the textbook equation: a column with the REPRESENTATION on top (a formula in its typography, a drawing at the fixed bond
 * length, or the name), then the NAME (small, muted), then its WORD (italic: the outcome's selectivity word or a role). What the
 * representation is comes from `termRepresentationOf` (core); this file only lays it out. A coefficient other than 1 is printed before
 * the column at text size.
 */
import type { EquationTerm, FormulaRepresentation } from '@/core/graph';
import { needsFacts, termRepresentationOf } from '@/core/graph';
import type { StructureRep } from '@/core/schema';
import { drawingFailed, useRetryingDepiction, type DepictionBinding, type DepictionTimers } from '@/render/svg';
import { formulaRuns } from '@/render/scene';
import { EQUATION_BOND_PX, MAX_DRAWING_HEIGHT, MAX_DRAWING_WIDTH, type StructureFactsPort } from './contracts';
import { drawingSizeOf } from './drawing-size';
import { Runs } from './runs';
import { useFactsInput } from './use-facts';
import styles from './equation-scheme.module.css';

export interface TermPorts {
  readonly binding: DepictionBinding | undefined;
  readonly timers: DepictionTimers;
  readonly facts: StructureFactsPort | undefined;
  /** The widest a drawing is shown; a wider one is scaled down whole (the phone's is smaller). */
  readonly maxDrawingWidth?: number;
}

const FormulaView = (props: { readonly formula: FormulaRepresentation }) => (
  <span className={styles.formula} data-equation-formula="">
    <Runs runs={formulaRuns(props.formula.text, props.formula.charge)} />
  </span>
);

const NameOnly = (props: { readonly name: string }) => (
  <span className={styles.nameOnly} data-equation-name-only="">
    {props.name}
  </span>
);

const Loading = () => <span className={styles.loading}>Drawing the structure…</span>;

function Drawing(props: { readonly structure: StructureRep; readonly name: string; readonly fallback: FormulaRepresentation | { readonly kind: 'name' }; readonly ports: TermPorts }) {
  const { binding, timers } = props.ports;
  const key = binding?.keyOf(props.structure);
  const status = useRetryingDepiction(binding?.manager, key, timers);
  if (status.state === 'ready') {
    // the size RDKit gave the drawing is the size of its molecule at the fixed scale; the bond length is the same for every drawing
    const size = status.width === undefined || status.height === undefined ? undefined : drawingSizeOf({ width: status.width, height: status.height }, EQUATION_BOND_PX, props.ports.maxDrawingWidth ?? MAX_DRAWING_WIDTH, MAX_DRAWING_HEIGHT);
    return (
      <img
        src={status.url}
        alt={`Structure of ${props.name}`}
        {...(size === undefined ? { style: { maxWidth: props.ports.maxDrawingWidth ?? MAX_DRAWING_WIDTH, maxHeight: MAX_DRAWING_HEIGHT } } : { width: size.width, height: size.height, 'data-bond-px': size.bondPx })}
      />
    );
  }
  // a drawing that cannot be made is the formula, else the name (never an empty box)
  if (key === undefined || drawingFailed(status)) return props.fallback.kind === 'formula' ? <FormulaView formula={props.fallback} /> : <NameOnly name={props.name} />;
  return <Loading />;
}

const wordOf = (term: EquationTerm): string | null =>
  term.word !== null ? `(${term.quantifier === null ? '' : `${term.quantifier} `}${term.word})` : term.role !== null ? `(${term.role})` : null;

export function TermColumn(props: { readonly term: EquationTerm; readonly names: boolean; readonly ports: TermPorts }) {
  const { term, names, ports } = props;
  const { substance } = term;
  const facts = useFactsInput(ports.facts, substance.structure, needsFacts(substance));
  const representation = termRepresentationOf(substance, facts);
  const word = wordOf(term);
  const label = term.coefficient === null ? term.name : `${term.coefficient} ${term.name}`;
  return (
    <div className={styles.term} data-equation-term="">
      {term.coefficient === null ? null : (
        <span className={styles.coefficient} data-equation-coefficient="">
          {term.coefficient}
        </span>
      )}
      <div className={styles.column} role="group" aria-label={label}>
        <div className={styles.rep}>
          {representation.kind === 'formula' ? <FormulaView formula={representation} /> : null}
          {representation.kind === 'name' ? <NameOnly name={term.name} /> : null}
          {representation.kind === 'pending' ? <Loading /> : null}
          {representation.kind === 'drawing' ? <Drawing structure={representation.structure} name={term.name} fallback={representation.fallback} ports={ports} /> : null}
        </div>
        {names && representation.kind !== 'name' ? (
          <span className={styles.name} data-equation-name="">
            {term.name}
          </span>
        ) : null}
        {word === null ? null : (
          <span className={styles.word} data-equation-word="">
            {word}
          </span>
        )}
      </div>
    </div>
  );
}
