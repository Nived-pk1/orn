/**
 * The textbook equation (equation step, part 5): `term + term -> term + term` in one row that wraps, each term a column
 * (`term-view.tsx`), the "+" signs and the arrow on the middle line of the drawings. The term selection, roles and words are those of the
 * one-line equation (`core/graph/full-equation.ts`); only the presentation changes. The scheme is a group named "Full equation" (or the
 * caller's label for one outcome of several) whose accessible DESCRIPTION is the old one-line sentence, so a screen reader reads the same
 * words as before. The "Names" switch in its header shows or hides the name lines only.
 */
import { Fragment, useId } from 'react';
import type { FullEquation } from '@/core/graph';
import type { DepictionBinding, DepictionTimers } from '@/render/svg';
import type { StructureFactsPort } from './contracts';
import { SchemeArrow } from './scheme-arrow';
import { TermColumn, type TermPorts } from './term-view';
import styles from './equation-scheme.module.css';

export interface EquationSchemeProps {
  readonly equation: FullEquation;
  /** The fixed-scale depiction binding (`EQUATION_AREA`); absent: no drawing is asked for and every term is its formula or name. */
  readonly binding: DepictionBinding | undefined;
  readonly timers: DepictionTimers;
  /** The chem facts the formula-or-drawing rule needs; absent: the facts are `unavailable`. */
  readonly facts: StructureFactsPort | undefined;
  /** Whether the name lines are shown. */
  readonly names: boolean;
  /** Called with the new value when the Names switch is changed; absent: the scheme shows no switch (one outcome of several shows it once). */
  readonly onNamesChange?: (names: boolean) => void;
  /** The group's name: "Full equation" when absent; an outcome's own label when the reaction has several. */
  readonly label?: string;
  readonly maxDrawingWidth?: number;
}

function Side(props: { readonly terms: FullEquation['reactants']; readonly names: boolean; readonly ports: TermPorts; readonly empty: string }) {
  if (props.terms.length === 0) return <span>{props.empty}</span>;
  return (
    <>
      {props.terms.map((term, index) => (
        <Fragment key={`${term.ref.id}:${index}`}>
          {index > 0 ? (
            <span className={styles.plus} data-equation-plus="" aria-hidden="true">
              +
            </span>
          ) : null}
          <TermColumn term={term} names={props.names} ports={props.ports} />
        </Fragment>
      ))}
    </>
  );
}

export function EquationScheme(props: EquationSchemeProps) {
  const { equation, names } = props;
  const descriptionId = useId();
  const ports: TermPorts = { binding: props.binding, timers: props.timers, facts: props.facts, ...(props.maxDrawingWidth === undefined ? {} : { maxDrawingWidth: props.maxDrawingWidth }) };
  return (
    <div className={styles.scheme} role="group" aria-label={props.label ?? 'Full equation'} aria-describedby={descriptionId} data-equation-scheme="">
      <span id={descriptionId} className={styles.sr}>
        {equation.text}
      </span>
      {props.onNamesChange === undefined ? null : (
        <div className={styles.header}>
          <label className={styles.names}>
            <input type="checkbox" checked={names} onChange={(event) => props.onNamesChange?.(event.target.checked)} />
            <span>Names</span>
          </label>
        </div>
      )}
      <div className={styles.row}>
        <Side terms={equation.reactants} names={names} ports={ports} empty="nothing listed" />
        <span className={styles.arrowCell}>
          <SchemeArrow arrow={equation.arrow} equilibrium={equation.equilibrium} />
        </span>
        <Side terms={equation.products} names={names} ports={ports} empty="nothing listed" />
      </div>
    </div>
  );
}
