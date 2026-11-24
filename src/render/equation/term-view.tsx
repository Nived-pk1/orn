/**
 * One term of the textbook equation: a column with the REPRESENTATION on top (a formula in its typography, a drawing at the fixed bond
 * length, or the name), then the NAME (small, muted), then its WORD (italic: the outcome's selectivity word or a role). What the
 * representation is comes from `termRepresentationOf` (core); this file only lays it out. A coefficient other than 1 is printed before
 * the column at text size.
 */
import { Fragment } from 'react';
import type { EquationTerm, FormulaRepresentation } from '@/core/graph';
import { needsFacts, termRepresentationOf } from '@/core/graph';
import type { StructureRep } from '@/core/schema';
import { DepictionSurface, drawingFailed, useRetryingDepiction, type DepictionBinding, type DepictionTimers } from '@/render/svg';
import { formulaRuns } from '@/render/scene';
import type { StructureFactsPort } from './contracts';
import { wordOf } from './hang';
import { Runs } from './runs';
import { nameBreaks, SIZE_RULES, sizeDrawing, type SizeContext } from './size-rule';
import { useFactsInput } from './use-facts';
import { useRowScaleValue } from './use-row-scale';
import { useAvailableWidth } from './use-width';
import styles from './equation-scheme.module.css';

export interface TermPorts {
  readonly binding: DepictionBinding | undefined;
  readonly timers: DepictionTimers;
  readonly facts: StructureFactsPort | undefined;
  /** The size context (step 8.5e): `equation` (default) or `hero`; it sets the bond length the drawings are asked for and shown at. */
  readonly context?: Extract<SizeContext, 'equation' | 'hero'>;
  /** A scale the caller applies to the whole row from outside (the hero's row mode): `data-bond-px` reports the bond as drawn after it. */
  readonly scale?: number;
}

const FormulaView = (props: { readonly formula: FormulaRepresentation }) => (
  <span className={styles.formula} data-equation-formula="">
    <Runs runs={formulaRuns(props.formula.text, props.formula.charge)} />
  </span>
);

/** A name breaks at spaces, after a dash and after a comma, never in the middle of a word (step 8.5d R3). */
export const NameText = (props: { readonly name: string }) => (
  <>
    {nameBreaks(props.name).map((part, i) => (
      <Fragment key={i}>
        {i > 0 ? <wbr /> : null}
        {part}
      </Fragment>
    ))}
  </>
);

const NameOnly = (props: { readonly name: string }) => (
  <span className={styles.nameOnly} data-equation-name-only="">
    <NameText name={props.name} />
  </span>
);

const Loading = () => <span className={styles.loading}>Drawing the structure…</span>;

function Drawing(props: { readonly structure: StructureRep; readonly name: string; readonly fallback: FormulaRepresentation | { readonly kind: 'name' }; readonly ports: TermPorts }) {
  const { binding, timers } = props.ports;
  const context = props.ports.context ?? 'equation';
  const key = binding?.keyOf(props.structure, SIZE_RULES[context].standard);
  const status = useRetryingDepiction(binding?.manager, key, timers);
  const available = useAvailableWidth();
  const rowScale = useRowScaleValue();
  if (status.state === 'ready') {
    // one size rule (8.5d): the standard bond length; the box follows the drawing; narrower space: shrink to the floor, then the box scrolls
    const fit = status.width === undefined || status.height === undefined ? undefined : sizeDrawing({ width: status.width, height: status.height }, context, { available: available ?? Number.POSITIVE_INFINITY });
    // the whole row's scale (E2 a) applies to a drawing that is not in a scrolling box; `data-bond-px` is the bond length as drawn, after every scale (E2 c)
    const row = fit === undefined || fit.mode === 'scroll' ? 1 : rowScale;
    const drawn = fit === undefined ? undefined : { width: Math.max(1, Math.round(fit.width * row)), height: Math.max(1, Math.round(fit.height * row)), bondPx: Math.round(fit.bondPx * row * (props.ports.scale ?? 1) * 100) / 100 };
    const img = <img src={status.url} alt={`Structure of ${props.name}`}{...(drawn === undefined ? {} : { width: drawn.width, height: drawn.height, 'data-bond-px': drawn.bondPx })} />;
    return <DepictionSurface>{fit?.mode === 'scroll' ? <div className={styles.scrollBox} data-scrolls="" tabIndex={0} style={{ width: fit.boxWidth }}>{img}</div> : img}</DepictionSurface>;
  }
  // a drawing that cannot be made is the formula, else the name (never an empty box)
  if (key === undefined || drawingFailed(status)) return props.fallback.kind === 'formula' ? <FormulaView formula={props.fallback} /> : <NameOnly name={props.name} />;
  return <Loading />;
}

export function TermColumn(props: { readonly term: EquationTerm; readonly names: boolean; readonly ports: TermPorts }) {
  const { term, names, ports } = props;
  const { substance } = term;
  const facts = useFactsInput(ports.facts, substance.structure, needsFacts(substance));
  const representation = termRepresentationOf(substance, facts);
  const word = wordOf(term);
  const label = term.coefficient === null ? term.name : `${term.coefficient} ${term.name}`;
  const nameShown = names && representation.kind !== 'name';
  return (
    <div className={styles.term} data-equation-term="">
      {term.coefficient === null ? null : (
        <span className={styles.coefficient} data-equation-coefficient="">
          {term.coefficient}
        </span>
      )}
      <div className={styles.column} role="group" aria-label={label}>
        <div className={styles.rep} data-equation-rep="">
          {representation.kind === 'formula' ? <FormulaView formula={representation} /> : null}
          {representation.kind === 'name' ? <NameOnly name={term.name} /> : null}
          {representation.kind === 'pending' ? <Loading /> : null}
          {representation.kind === 'drawing' ? <Drawing structure={representation.structure} name={term.name} fallback={representation.fallback} ports={ports} /> : null}
        </div>
        {nameShown || word !== null ? (
          <div className={styles.hang} data-equation-hang="">
            {nameShown ? (
              <span className={styles.name} data-equation-name="">
                <NameText name={term.name} />
              </span>
            ) : null}
            {word === null ? null : (
              <span className={styles.word} data-equation-word="">
                {word}
              </span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
