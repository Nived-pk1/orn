/**
 * The reagent editor's Identity, Families and Classes sections (step 6.2b decision D3). Identity: ONE backing species through the species
 * picker, OR components (species, classes or reagents, each with its role and an optional amount), never both: while one is present the
 * other's picker is not offered and the reason is said (the schema allows both, RGT-001 warns). A component that would close a cycle of
 * compositions (HIER-003) is refused by the picker with the reason, before Save. Each section renders the draft and reports every change as
 * a recipe with the field path; none decides what is valid (L1 and the store's gate do).
 */
import { COMPONENT_ROLES, REAGENT_FAMILIES } from '@/core/schema';
import { Button } from '@/ui/primitives';
import { FormulaText } from './formula-text';
import { choiceLine, RecordList, RecordPicker } from './record-picker';
import type { PickKind, RecordPickerPort } from './record-picker-contracts';
import {
  addComponent,
  clearSpecies,
  moveComponent,
  reagentViewOf,
  removeComponent,
  setComponentAmount,
  setComponentRole,
  setReagentFormula,
  setSpecies,
  toggleFamily,
  wordsOf,
} from './reagent-model';
import type { SectionProps } from './section-props';
import { addClass, removeClass } from './species-model';
import styles from './editor.module.css';

export interface ReagentPickerSectionProps extends SectionProps {
  readonly picker?: RecordPickerPort;
}

const bad = (props: SectionProps, path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);
const SPECIES = ['species'] as const;
const CLASSES = ['class'] as const;
const COMPONENT_KINDS: readonly PickKind[] = ['species', 'class', 'reagent'];

export function ReagentIdentitySection(props: ReagentPickerSectionProps) {
  const view = reagentViewOf(props.draft);
  const { picker, onEdit } = props;
  const locked = props.unavailable;
  const hasSpecies = view.speciesId !== undefined;
  const hasComponents = view.components.length > 0;
  return (
    <div>
      <h4 className={styles.hint}>Backing species</h4>
      <RecordList label="Backing species" fieldPath="speciesId" items={hasSpecies ? [{ kind: 'species', id: view.speciesId as string }] : []} port={picker} unavailable={locked} emptyText="None: this reagent is not exactly one species." onRemove={() => onEdit(clearSpecies())} />
      {hasSpecies || hasComponents ? null : (
        <RecordPicker id="backing-search" label="Find the backing species by name" kinds={SPECIES} port={picker} noun="species" resultsLabel="Backing species found" unavailable={locked} isListed={() => false} onPick={(choice) => onEdit(setSpecies(choice.id))} />
      )}
      {hasComponents && !hasSpecies ? <p className={styles.hint}>A reagent is one species or a mixture of components, not both: remove the components to choose a species.</p> : null}

      <h4 className={styles.hint}>Components</h4>
      {hasSpecies && hasComponents ? <p className={styles.notice}>This reagent has both a backing species and components. Use one or the other (RGT-001): remove one.</p> : null}
      {!hasComponents ? <p className={styles.hint}>None.</p> : null}
      <ul className={styles.list} aria-label="Components" data-field-path="components">
        {view.components.map((component, index) => {
          const name = picker?.describe(component.kind, component.id)?.name ?? component.id;
          return (
            <li key={`${component.kind}:${component.id}`} className={styles.row}>
              <span>{choiceLine(picker?.describe(component.kind, component.id), component.id)}</span>
              <label>
                Role of {name}{' '}
                <select value={component.role} disabled={locked !== undefined} aria-invalid={bad(props, `components[${index}].role`)} data-field-path={`components[${index}].role`} onChange={(event) => onEdit(setComponentRole(index, event.target.value), `components[${index}].role`)}>
                  {COMPONENT_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {wordsOf(role)}
                    </option>
                  ))}
                </select>
              </label>
              <input type="text" value={component.amountText} readOnly={locked !== undefined} aria-label={`Amount of ${name} (optional)`} aria-invalid={bad(props, `components[${index}].amountText`)} data-field-path={`components[${index}].amountText`} autoComplete="off" onChange={(event) => onEdit(setComponentAmount(index, event.target.value), `components[${index}].amountText`)} />
              <Button aria-label={`Move ${name} up`} {...(locked !== undefined ? { unavailable: locked } : index === 0 ? { unavailable: 'it is first' } : { onClick: () => onEdit(moveComponent(index, -1)) })}>
                Up
              </Button>
              <Button aria-label={`Move ${name} down`} {...(locked !== undefined ? { unavailable: locked } : index === view.components.length - 1 ? { unavailable: 'it is last' } : { onClick: () => onEdit(moveComponent(index, 1)) })}>
                Down
              </Button>
              <Button aria-label={`Remove ${name}`} {...(locked === undefined ? { onClick: () => onEdit(removeComponent(index)) } : { unavailable: locked })}>
                Remove
              </Button>
            </li>
          );
        })}
      </ul>
      {hasSpecies ? (
        <p className={styles.hint}>To build this reagent from components, remove its backing species first.</p>
      ) : (
        <RecordPicker
          id="component-search"
          label="Find a component by name"
          kinds={COMPONENT_KINDS}
          port={picker}
          noun="record"
          resultsLabel="Components found"
          unavailable={locked}
          isListed={(choice) => view.components.some((component) => component.kind === choice.kind && component.id === choice.id)}
          refusal={(choice) => picker?.componentRefusal?.(view.id, choice)}
          onPick={(choice) => onEdit(addComponent(choice))}
        />
      )}

      <div className={styles.field}>
        <label htmlFor="reagent-formula">Display formula (optional, for example KMnO4 / H+)</label>
        <input id="reagent-formula" type="text" value={view.formulaText} readOnly={locked !== undefined} aria-invalid={bad(props, 'formulaText')} data-field-path="formulaText" autoComplete="off" spellCheck={false} onChange={(event) => onEdit(setReagentFormula(event.target.value), 'formulaText')} />
      </div>
      {view.formulaText === '' ? null : (
        <p className={styles.hint}>
          Preview: <FormulaText formula={view.formulaText} />
        </p>
      )}
    </div>
  );
}

export function FamiliesSection(props: SectionProps) {
  const view = reagentViewOf(props.draft);
  const locked = props.unavailable !== undefined;
  return (
    <fieldset className={styles.field} data-field-path="families" aria-invalid={bad(props, 'families')}>
      <legend>Families of reagent</legend>
      <div className={styles.choices}>
        {REAGENT_FAMILIES.map((family) => (
          <label key={family} className={styles.choice}>
            <input type="checkbox" checked={view.families.includes(family)} disabled={locked} onChange={(event) => props.onEdit(toggleFamily(family, event.target.checked))} />
            {wordsOf(family)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ReagentClassesSection(props: ReagentPickerSectionProps) {
  const view = reagentViewOf(props.draft);
  const { picker, onEdit } = props;
  const locked = props.unavailable;
  return (
    <div>
      <RecordList label="Listed classes" fieldPath="classIds" items={view.classIds.map((id) => ({ kind: 'class' as const, id }))} port={picker} unavailable={locked} onRemove={(index) => onEdit(removeClass(view.classIds[index] as string))} />
      <RecordPicker id="reagent-class-search" label="Find a class by name" kinds={CLASSES} port={picker} noun="class" resultsLabel="Classes found" unavailable={locked} isListed={(choice) => view.classIds.includes(choice.id)} onPick={(choice) => onEdit(addClass(choice.id))} />
      <p className={styles.hint}>Chemical families of this reagent, for example the hydride reducing agents (classes of the kind reagent family).</p>
    </div>
  );
}
