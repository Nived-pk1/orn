/**
 * The species rows of ONE expanded mechanism step (step 6.5a decision D4): a role (the schema's seven values, none chosen for a new row) and
 * what the species IS: a record through the generic picker, a label, an inline structure through the structure panel (atom-map numbers allowed
 * and kept exactly as typed). A row keeps every part it holds (nothing is dropped when another part is added; MEC-002 needs at least one).
 * Text only; the recipes decide and the chem worker reads the structure.
 */
import { useState } from 'react';
import { STEP_SPECIES_ROLES } from '@/core/schema';
import { Button } from '@/ui/primitives';
import { RecordPicker } from './record-picker';
import type { RecordPickerPort } from './record-picker-contracts';
import { wordsOf } from './reagent-model';
import type { SectionProps } from './section-props';
import { isBag, readRows, text, type Fields } from './step-model';
import { addSpecies, moveSpecies, onSpeciesRow, removeSpecies, setSpeciesLabel, setSpeciesRef, setSpeciesRole } from './step-rows-model';
import type { StructurePort } from './structure-contracts';
import { StructurePanel } from './structure-panel';
import styles from './editor.module.css';
import fields from './step-fields.module.css';
import own from './participant.module.css';

export interface StepSpeciesProps extends SectionProps {
  readonly v: number;
  readonly s: number;
  readonly picker?: RecordPickerPort | undefined;
  readonly structure?: StructurePort | undefined;
  readonly timers: { after(ms: number, run: () => void): () => void };
}

const bad = (props: SectionProps, path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);

export function StepSpeciesRows(props: StepSpeciesProps) {
  const { v, s, onEdit, picker } = props;
  const locked = props.unavailable;
  const rows = readRows(props.draft, v, s, 'species');
  /** Rows whose structure field is open although they hold no structure yet (the person is about to type one). */
  const [opened, setOpened] = useState<readonly number[]>([]);
  const off = (action: () => void, why?: string) => (locked !== undefined ? { unavailable: locked } : why !== undefined ? { unavailable: why } : { onClick: action });
  return (
    <div className={styles.field}>
      <h5 className={styles.hint}>Species</h5>
      {rows.length === 0 ? <p className={styles.hint}>No species in this step yet.</p> : null}
      <ul className={styles.list} aria-label="Species">
        {rows.map((row, index) => {
          const k = index + 1;
          const base = `variants[${v}].steps[${s}].species[${index}]`;
          const role = text(row['role']);
          const ref = isBag(row['ref']) && typeof row['ref']['id'] === 'string' && typeof row['ref']['kind'] === 'string' ? (row['ref'] as { kind: 'species' | 'class' | 'reagent'; id: string }) : undefined;
          const hasStructure = isBag(row['structure']) && text((row['structure'] as Fields)['value']) !== '';
          const showStructure = hasStructure || opened.includes(index);
          const chosen = ref === undefined ? undefined : picker?.describe(ref.kind, ref.id);
          return (
            <li key={index} className={`${styles.panel} ${props.phone === true ? fields.nestedRow : ''}`} data-testid="species-row" data-phone={props.phone === true ? 'true' : undefined}>
              <div className={`${own.participantBody} ${props.phone === true ? own.participantPhone : ''}`}>
                <div className={own.participantHead}>
                  <select aria-label={`Role of species ${k}`} value={role} disabled={locked !== undefined} aria-invalid={bad(props, `${base}.role`)} data-field-path={`${base}.role`} onChange={(event) => onEdit(setSpeciesRole(v, s, index, event.target.value), `${base}.role`)}>
                    {role === '' ? <option value="">Choose a role</option> : null}
                    {role !== '' && !(STEP_SPECIES_ROLES as readonly string[]).includes(role) ? <option value={role}>{role}</option> : null}
                    {STEP_SPECIES_ROLES.map((one) => (
                      <option key={one} value={one}>
                        {wordsOf(one)}
                      </option>
                    ))}
                  </select>
                  <div className={own.participantActions}>
                    <Button aria-label={`Move species ${k} up`} {...off(() => (setOpened([]), onEdit(moveSpecies(v, s, index, -1))), index === 0 ? 'it is first' : undefined)}>
                      Up
                    </Button>
                    <Button aria-label={`Move species ${k} down`} {...off(() => (setOpened([]), onEdit(moveSpecies(v, s, index, 1))), index === rows.length - 1 ? 'it is last' : undefined)}>
                      Down
                    </Button>
                    <Button aria-label={`Remove species ${k}`} {...off(() => (setOpened([]), onEdit(removeSpecies(v, s, index))))}>
                      Remove
                    </Button>
                  </div>
                </div>
                <div className={styles.field} data-field-path={base}>
                  <label htmlFor={`sp-label-${v}-${s}-${index}`}>Label (optional)</label>
                  <input id={`sp-label-${v}-${s}-${index}`} type="text" aria-label={`Label of species ${k}`} value={text(row['label'])} readOnly={locked !== undefined} aria-invalid={bad(props, `${base}.label`)} data-field-path={`${base}.label`} autoComplete="off" onChange={(event) => onEdit(setSpeciesLabel(v, s, index, event.target.value), `${base}.label`)} />
                </div>
                {ref !== undefined ? (
                  <p>
                    Record: {chosen === undefined ? ref.id : `${chosen.name} (${chosen.kindWords})`}{' '}
                    <Button aria-label={`Remove record of species ${k}`} {...off(() => onEdit(setSpeciesRef(v, s, index, undefined)))}>
                      Remove record
                    </Button>
                  </p>
                ) : (
                  <RecordPicker
                    id={`sp-record-${v}-${s}-${index}`}
                    label={`Find the record of species ${k} by name`}
                    kinds={['species', 'class', 'reagent']}
                    port={picker}
                    noun="record"
                    resultsLabel={`Records found for species ${k}`}
                    unavailable={locked}
                    isListed={() => false}
                    onPick={(choice) => onEdit(setSpeciesRef(v, s, index, { kind: choice.kind as 'species' | 'class' | 'reagent', id: choice.id }), `${base}.ref`)}
                  />
                )}
                {showStructure ? (
                  <>
                    {props.structure === undefined ? (
                      <p className={styles.hint}>The structure panel is not available here{hasStructure ? '; the structure is kept as it is.' : '.'}</p>
                    ) : (
                      <StructurePanel
                        draft={row}
                        port={props.structure}
                        timers={props.timers}
                        idBase={`sp-${v}-${s}-${index}`}
                        label={`SMILES, CXSMILES or molfile of species ${k}`}
                        showFacts={false}
                        {...(locked === undefined ? {} : { unavailable: locked })}
                        {...(props.phone === undefined ? {} : { phone: props.phone })}
                        onEdit={(recipe) => onEdit(onSpeciesRow(v, s, index, (target) => recipe(target as never)), `${base}.structure`)}
                      />
                    )}
                    {hasStructure ? (
                      <Button aria-label={`Remove structure of species ${k}`} {...off(() => onEdit(onSpeciesRow(v, s, index, (target) => void Reflect.deleteProperty(target, 'structure'))))}>
                        Remove structure
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <Button aria-label={`Add structure to species ${k}`} {...off(() => setOpened([...opened, index]))}>
                    Add structure
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Button {...off(() => onEdit(addSpecies(v, s)))}>Add species</Button>
    </div>
  );
}
