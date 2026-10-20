/**
 * The mechanism editor's Identity and Summary sections (step 6.5a decision D2): the name and the aliases (a mechanism has `name` + `aliases`,
 * not `Names`) and the summary as a rich-text field. Text only; the recipes decide.
 */
import { addAlias, moveAlias, removeAlias, setAlias, setName } from './reaction-model';
import { mechanismViewOf, setSummary } from './mechanism-model';
import type { MechanismLinksPort } from './mechanism-contracts';
import { RichTextField } from './rich-text-field';
import type { SectionProps } from './section-props';
import { StringListEditor } from './string-list-editor';
import styles from './editor.module.css';

const bad = (props: SectionProps, path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);

export function MechanismIdentitySection(props: SectionProps) {
  const view = mechanismViewOf(props.draft);
  const { onEdit } = props;
  const locked = props.unavailable;
  return (
    <div>
      <div className={styles.field}>
        <label htmlFor="mechanism-name">Name (required)</label>
        <input id="mechanism-name" type="text" value={view.name} readOnly={locked !== undefined} aria-invalid={bad(props, 'name')} data-field-path="name" autoComplete="off" spellCheck={false} onChange={(event) => onEdit(setName(event.target.value), 'name')} />
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
    </div>
  );
}

export function MechanismSummarySection(props: SectionProps & { readonly links?: MechanismLinksPort | undefined }) {
  const view = mechanismViewOf(props.draft);
  return (
    <RichTextField
      id="mechanism-summary"
      label="Summary"
      path="summary"
      value={view.summary}
      invalid={props.invalid?.has('summary') === true}
      unavailable={props.unavailable}
      phone={props.phone}
      linkExists={props.links?.exists}
      onChange={(value) => props.onEdit(setSummary(value), 'summary')}
    />
  );
}
