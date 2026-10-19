/**
 * The class editor's Generic representation section (step 6.2b decision D1): the generic formula text and the general formula (each with
 * a preview in the formula typography), a generic structure through the STRUCTURE PANEL in its generic mode (R-labelled CXSMILES, drawn,
 * no formula derived), and the membership SMARTS with its validity checked by the chem worker 400 ms after the last change. A SMARTS the
 * engine cannot read is kept as typed and said in the engine's words; a worker that did not answer is said as such and is NOT "invalid".
 * The SMARTS only ever makes SUGGESTIONS (CHEM-007); it never assigns a class.
 */
import { useEffect, useRef, useState } from 'react';
import { FormulaText } from './formula-text';
import { setGenericText, classViewOf, type GenericText } from './class-model';
import type { SectionProps } from './section-props';
import { StructurePanel } from './structure-panel';
import type { StructurePort } from './structure-contracts';
import styles from './editor.module.css';

export const SMARTS_CHECK_DEBOUNCE_MS = 400;

type Timers = { after(ms: number, run: () => void): () => void };

export interface GenericSectionProps extends SectionProps {
  readonly structure: StructurePort | undefined;
  readonly timers: Timers;
}

type SmartsState =
  | { readonly state: 'idle' }
  | { readonly state: 'checking' }
  | { readonly state: 'ok' }
  | { readonly state: 'invalid'; readonly message: string }
  | { readonly state: 'unanswered'; readonly message: string };

function useSmartsCheck(smarts: string, port: StructurePort | undefined, timers: Timers): SmartsState {
  const [state, setState] = useState<SmartsState>({ state: 'idle' });
  const version = useRef(0);
  useEffect(() => {
    version.current += 1;
    const mine = version.current;
    const check = port?.checkSmarts;
    if (smarts === '' || check === undefined) {
      setState({ state: 'idle' });
      return undefined;
    }
    setState({ state: 'checking' });
    return timers.after(SMARTS_CHECK_DEBOUNCE_MS, () => {
      void check(smarts).then((answer) => {
        if (mine === version.current) setState(answer); // an answer for an older text is dropped
      });
    });
  }, [smarts, port, timers]);
  return state;
}

const bad = (props: SectionProps, path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);

function SmartsNote(props: { readonly state: SmartsState }) {
  const { state } = props;
  if (state.state === 'checking') return <p className={styles.hint} role="status">Checking the pattern...</p>;
  if (state.state === 'ok') return <p className={styles.hint} role="status">The chemistry engine can read this pattern.</p>;
  if (state.state === 'invalid') {
    return (
      <p className={styles.notice} role="alert">
        The chemistry engine could not read this pattern: {state.message}. It is kept as typed and suggests nothing until it is fixed.
      </p>
    );
  }
  if (state.state === 'unanswered') return <p className={styles.hint} role="status">The chemistry engine did not answer, so the pattern was not checked: {state.message}</p>;
  return null;
}

export function GenericSection(props: GenericSectionProps) {
  const view = classViewOf(props.draft);
  const locked = props.unavailable !== undefined;
  const smarts = useSmartsCheck(view.smarts, props.structure, props.timers);
  const text = (field: GenericText, id: string, label: string, value: string, mono: boolean) => (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" value={value} readOnly={locked} aria-invalid={bad(props, `generic.${field}`)} data-field-path={`generic.${field}`} autoComplete="off" spellCheck={false} className={mono ? styles.mono : undefined} onChange={(event) => props.onEdit(setGenericText(field, event.target.value), `generic.${field}`)} />
    </div>
  );
  return (
    <div>
      {text('formulaText', 'class-formula-text', 'Generic formula (optional, for example R-OH)', view.formulaText, false)}
      {view.formulaText === '' ? null : (
        <p className={styles.hint}>
          Preview: <FormulaText formula={view.formulaText} />
        </p>
      )}
      {text('generalFormula', 'class-general-formula', 'General formula of a series (optional, for example CnH2n+2)', view.generalFormula, false)}
      {view.generalFormula === '' ? null : (
        <p className={styles.hint}>
          Preview: <FormulaText formula={view.generalFormula} />
        </p>
      )}
      <h4 className={styles.hint}>Generic structure (optional)</h4>
      {props.structure === undefined ? (
        <p className={styles.hint}>The chemistry engine is not available here, so the structure is not read.</p>
      ) : (
        <StructurePanel draft={props.draft} onEdit={props.onEdit} port={props.structure} timers={props.timers} slot="generic" {...(props.invalid === undefined ? {} : { invalid: props.invalid })} {...(props.unavailable === undefined ? {} : { unavailable: props.unavailable })} {...(props.phone === true ? { phone: true } : {})} />
      )}
      {text('smarts', 'class-smarts', 'Membership SMARTS (optional)', view.smarts, true)}
      <SmartsNote state={smarts} />
      <p className={styles.hint}>A SMARTS only makes suggestions on species whose structure matches it. It never adds a class by itself.</p>
    </div>
  );
}
