/**
 * The reaction editor's Identity section (step 6.3a decisions D1 and 2): the name and the aliases (a reaction has no `Names`), the scope
 * (generic or specific; absent until chosen, "Choose a scope"), the generic reaction this one is an instance of (a picker of GENERIC
 * reactions only, RXN-013 stays the gate at Save), the purposes, and the read-only line for a legacy reagent family ("From the older app:
 * reagent family aq. KOH": never linked automatically). Text only; no chemistry.
 */
import { REACTION_PURPOSES } from '@/core/schema';
import { RecordList, RecordPicker } from './record-picker';
import type { RecordPickerPort } from './record-picker-contracts';
import { addAlias, clearInstanceOf, moveAlias, reactionViewOf, removeAlias, setAlias, setInstanceOf, setName, setScope, togglePurpose } from './reaction-model';
import { wordsOf } from './reagent-model';
import type { SectionProps } from './section-props';
import { StringListEditor } from './string-list-editor';
import styles from './editor.module.css';

export interface ReactionIdentityProps extends SectionProps {
  readonly picker?: RecordPickerPort | undefined;
}

const bad = (props: SectionProps, path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);

export function ReactionIdentitySection(props: ReactionIdentityProps) {
  const view = reactionViewOf(props.draft);
  const { onEdit } = props;
  const locked = props.unavailable;
  return (
    <div>
      <div className={styles.field}>
        <label htmlFor="reaction-name">Name (required)</label>
        <input id="reaction-name" type="text" value={view.name} readOnly={locked !== undefined} aria-invalid={bad(props, 'name')} data-field-path="name" autoComplete="off" spellCheck={false} onChange={(event) => onEdit(setName(event.target.value), 'name')} />
      </div>
      <StringListEditor
        title="Aliases"
        one="Alias"
        items={view.aliases}
        path="aliases"
        invalid={props.invalid}
        unavailable={locked}
        phone={props.phone}
        onSet={(index, value, path) => onEdit(setAlias(index, value), path)}
        onAdd={() => onEdit(addAlias())}
        onRemove={(index) => onEdit(removeAlias(index))}
        onMove={(index, by) => onEdit(moveAlias(index, by))}
      />
      <div className={styles.field}>
        <label htmlFor="reaction-scope">Scope (required)</label>
        <select id="reaction-scope" value={view.scope ?? ''} disabled={locked !== undefined} aria-invalid={bad(props, 'scope')} data-field-path="scope" onChange={(event) => onEdit(setScope(event.target.value), 'scope')}>
          {view.scope === undefined ? <option value="">Choose a scope</option> : null}
          <option value="generic">Generic (written with classes, like R-CH2OH)</option>
          <option value="specific">Specific (concrete species)</option>
        </select>
      </div>
      <h4 className={styles.hint}>Instance of</h4>
      {view.instanceOfId !== undefined ? (
        <>
          <RecordList label="Instance of" fieldPath="instanceOfId" items={[{ kind: 'reaction', id: view.instanceOfId }]} port={props.picker} unavailable={locked} onRemove={() => onEdit(clearInstanceOf())} />
          {view.scope === 'generic' ? <p className={styles.notice}>A generic reaction cannot be an instance of another one (RXN-013): remove this, or make the reaction specific.</p> : null}
        </>
      ) : view.scope !== 'specific' ? (
        <p className={styles.hint}>{view.scope === undefined ? 'Choose a scope first: only a specific reaction can be an instance of a generic one.' : 'Only a specific reaction can be an instance of a generic one.'}</p>
      ) : (
        <RecordPicker
          id="instance-search"
          label="Find the generic reaction by name"
          kinds={['reaction']}
          port={props.picker}
          noun="generic reaction"
          resultsLabel="Generic reactions found"
          unavailable={locked}
          isListed={() => false}
          refusal={(choice) => (choice.id === view.id ? 'A reaction cannot be an instance of itself.' : choice.reactionScope === 'generic' ? undefined : 'Only a generic reaction can be the base of a specific one (RXN-013).')}
          onPick={(choice) => onEdit(setInstanceOf(choice.id))}
        />
      )}
      <fieldset className={styles.field} data-field-path="purposes" aria-invalid={bad(props, 'purposes')}>
        <legend>Purposes</legend>
        <div className={styles.choices}>
          {REACTION_PURPOSES.map((purpose) => (
            <label key={purpose} className={styles.choice}>
              <input type="checkbox" checked={view.purposes.includes(purpose)} disabled={locked !== undefined} onChange={(event) => onEdit(togglePurpose(purpose, event.target.checked))} />
              {wordsOf(purpose)}
            </label>
          ))}
        </div>
      </fieldset>
      {view.legacyReagentFamily === undefined ? null : <p className={styles.hint}>From the older app: reagent family {view.legacyReagentFamily}</p>}
    </div>
  );
}
