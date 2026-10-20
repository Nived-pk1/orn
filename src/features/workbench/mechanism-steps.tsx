/**
 * The Steps of ONE expanded mechanism variant (step 6.5a decision D4 and D7): each step is ONE summary line ("Step <n> · <step kinds> ·
 * rate-determining · reversible") with Edit, Up, Down and Remove (Remove asks); one step is open at a time. The open one holds the step kinds
 * (a multi-choice), the species rows, the bonds formed and broken and the electron movements (chosen from the atom maps of THIS step), the two
 * flags, the stereochemical event and the description (rich text). The step's title and note are shown read-only (step 6.6). A finding of
 * CHEM-008 or a MEC rule marks the row it names and the step. Text only; the recipes decide.
 */
import { useState } from 'react';
import { STEP_KINDS, type StructureRep } from '@/core/schema';
import { Button } from '@/ui/primitives';
import conditionStyles from './condition.module.css';
import type { MechanismLinksPort } from './mechanism-contracts';
import type { RecordPickerPort } from './record-picker-contracts';
import { wordsOf } from './reagent-model';
import { RichTextField } from './rich-text-field';
import type { SectionProps } from './section-props';
import { BondRows, MapsNote, MovementRows } from './step-bonds';
import { useStepMaps } from './step-maps';
import { addStep, moveStep, readRows, removeStep, setStepFlag, setStepText, stepSummary, stepsViewOf, toggleStepKind, type StepView } from './step-model';
import { StepSpeciesRows } from './step-species';
import type { StructurePort } from './structure-contracts';
import styles from './editor.module.css';
import own from './participant.module.css';

export interface StepsSectionProps extends SectionProps {
  readonly v: number;
  readonly newId: (prefix: string) => string;
  readonly links?: MechanismLinksPort | undefined;
  readonly picker?: RecordPickerPort | undefined;
  readonly structure?: StructurePort | undefined;
  readonly timers: { after(ms: number, run: () => void): () => void };
}

const markedUnder = (invalid: ReadonlySet<string> | undefined, prefix: string): true | undefined => {
  if (invalid === undefined) return undefined;
  for (const path of invalid) if (path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`)) return true;
  return undefined;
};

/** The structures of a step's species that hold one, as the worker reads them. */
function structuresOf(draft: unknown, v: number, s: number): StructureRep[] {
  return readRows(draft, v, s, 'species').flatMap((row) => {
    const rep = row['structure'] as { format?: unknown; value?: unknown } | undefined;
    return typeof rep?.value === 'string' && rep.value !== '' && (rep.format === 'smiles' || rep.format === 'cxsmiles' || rep.format === 'molfile') ? [{ format: rep.format, value: rep.value } as StructureRep] : [];
  });
}

function OpenStep(props: StepsSectionProps & { readonly s: number; readonly view: StepView }) {
  const { v, s, view, onEdit } = props;
  const n = s + 1;
  const base = `variants[${v}].steps[${s}]`;
  const locked = props.unavailable;
  const maps = useStepMaps(structuresOf(props.draft, v, s), props.structure, props.timers);
  const common = { draft: props.draft, onEdit, v, s, ...(props.invalid === undefined ? {} : { invalid: props.invalid }), ...(locked === undefined ? {} : { unavailable: locked }), ...(props.phone === undefined ? {} : { phone: props.phone }) };
  return (
    <div className={`${own.participantBody} ${props.phone === true ? own.participantPhone : ''}`}>
      <fieldset className={styles.field} aria-label={`Step kinds of step ${n}`} data-field-path={`${base}.stepKinds`}>
        <legend>Step kinds</legend>
        <div className={styles.choices}>
          {STEP_KINDS.map((kind) => (
            <label key={kind} className={styles.choice}>
              <input type="checkbox" checked={view.kinds.includes(kind)} disabled={locked !== undefined} onChange={(event) => onEdit(toggleStepKind(v, s, kind, event.target.checked))} />
              {wordsOf(kind)}
            </label>
          ))}
        </div>
      </fieldset>
      <div role="group" aria-label={`Species of step ${n}`}>
        <StepSpeciesRows {...common} picker={props.picker} structure={props.structure} timers={props.timers} />
      </div>
      <div role="group" aria-label={`Bonds and electron movements of step ${n}`}>
        <BondRows {...common} field="bondsFormed" maps={maps} />
        <BondRows {...common} field="bondsBroken" maps={maps} />
        <MovementRows {...common} maps={maps} />
        <MapsNote maps={maps} />
        {maps.unread > 0 ? <p className={styles.hint}>{maps.unread} structure(s) of this step could not be read, so their atom maps are not offered.</p> : null}
        {maps.cut ? <p className={styles.hint}>Only the first 60 atom maps are offered.</p> : null}
      </div>
      <div className={styles.choices}>
        <label className={styles.choice}>
          <input type="checkbox" checked={view.isRateDetermining === true} disabled={locked !== undefined} data-field-path={`${base}.isRateDetermining`} onChange={(event) => onEdit(setStepFlag(v, s, 'isRateDetermining', event.target.checked))} />
          Rate-determining
        </label>
        <label className={styles.choice}>
          <input type="checkbox" checked={view.reversible === true} disabled={locked !== undefined} data-field-path={`${base}.reversible`} onChange={(event) => onEdit(setStepFlag(v, s, 'reversible', event.target.checked))} />
          Reversible
        </label>
      </div>
      <div className={styles.field}>
        <label htmlFor={`step-event-${v}-${s}`}>Stereochemical event</label>
        <input id={`step-event-${v}-${s}`} type="text" aria-label={`Stereochemical event of step ${n}`} value={view.stereochemicalEvent} readOnly={locked !== undefined} data-field-path={`${base}.stereochemicalEvent`} autoComplete="off" onChange={(event) => onEdit(setStepText(v, s, 'stereochemicalEvent', event.target.value), `${base}.stereochemicalEvent`)} />
      </div>
      <RichTextField
        id={`step-desc-${v}-${s}`}
        label={`Description of step ${n}`}
        path={`${base}.description`}
        value={view.description}
        invalid={props.invalid?.has(`${base}.description`) === true}
        unavailable={locked}
        phone={props.phone}
        linkExists={props.links?.exists}
        onChange={(value) => onEdit(setStepText(v, s, 'description', value), `${base}.description`)}
      />
      {view.title === '' ? null : <p>Title: {view.title}</p>}
      <p className={styles.hint}>The step&apos;s title and note are kept as they are. Editing arrives in step 6.6.</p>
    </div>
  );
}

export function StepsSection(props: StepsSectionProps) {
  const { v, onEdit } = props;
  const steps = stepsViewOf(props.draft, v);
  const locked = props.unavailable;
  const [openId, setOpenId] = useState<string | null>(null);
  const [asking, setAsking] = useState<number | null>(null);
  const off = (action: () => void, why?: string) => (locked !== undefined ? { unavailable: locked } : why !== undefined ? { unavailable: why } : { onClick: action });
  return (
    <div className={styles.field}>
      <h4 className={styles.hint}>Steps</h4>
      {steps.length === 0 ? <p className={styles.hint}>No steps yet.</p> : null}
      <ul className={styles.list} aria-label={`Steps of variant ${v + 1}`}>
        {steps.map((view, s) => {
          const n = s + 1;
          const base = `variants[${v}].steps[${s}]`;
          const open = openId === view.id;
          return (
            <li key={view.id || s} className={styles.panel} data-testid="step-row" data-phone={props.phone === true ? 'true' : undefined}>
              <div role="group" aria-label={`Step ${n}`} className={own.participantBody}>
                <div className={own.participantHead}>
                  <span className={conditionStyles.summary} data-testid="step-summary" aria-invalid={markedUnder(props.invalid, base)}>
                    {stepSummary(view, n)}
                  </span>
                  <div className={own.participantActions}>
                    <Button aria-label={`${open ? 'Close' : 'Edit'} step ${n}`} aria-expanded={open} data-field-path={base} data-open-row="" onClick={() => setOpenId(open ? null : view.id)}>
                      {open ? 'Close' : 'Edit'}
                    </Button>
                    <Button aria-label={`Move step ${n} up`} {...off(() => onEdit(moveStep(v, s, -1)), s === 0 ? 'it is first' : undefined)}>
                      Up
                    </Button>
                    <Button aria-label={`Move step ${n} down`} {...off(() => onEdit(moveStep(v, s, 1)), s === steps.length - 1 ? 'it is last' : undefined)}>
                      Down
                    </Button>
                    <Button aria-label={`Remove step ${n}`} {...off(() => setAsking(s))}>
                      Remove
                    </Button>
                  </div>
                </div>
                {asking === s ? (
                  <div className={styles.confirm} role="group" aria-label={`Remove step ${n}?`}>
                    <span>Step {n} and its {view.speciesCount} {view.speciesCount === 1 ? 'species' : 'species'}, bond changes and electron movements are removed. This can be undone in the editor.</span>
                    <Button
                      variant="primary"
                      onClick={() => {
                        onEdit(removeStep(v, s));
                        setAsking(null);
                        if (open) setOpenId(null);
                      }}
                    >
                      Remove the step
                    </Button>
                    <Button onClick={() => setAsking(null)}>Cancel</Button>
                  </div>
                ) : null}
                {open ? <OpenStep {...props} s={s} view={view} /> : null}
              </div>
            </li>
          );
        })}
      </ul>
      <Button
        {...off(() => {
          const id = props.newId('mst');
          onEdit(addStep(v, id));
          setOpenId(id);
        })}
      >
        Add step
      </Button>
    </div>
  );
}
