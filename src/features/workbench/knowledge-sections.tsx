/**
 * The sections the knowledge editors share (step 6.6b part 2, decisions N1 to N3): name and aliases, the kind of concept ("Choose a kind",
 * no default), difficulty ("Not set" or 1 to 5), parents with the CYCLE question asked before Save, a list of linked classes, one-line
 * texts, "Used by" (the reactions that name the record: derived, read-only, each with a way to open it) and the read-only record of a
 * future seam. Each reports every change as a recipe with the field path; none decides what is valid (L1 and the store's gate do).
 */
import { CARBON_CHAIN_CHANGES, CONCEPT_KINDS } from '@/core/schema';
import type { RecordRef } from '@/core/schema';
import { Button } from '@/ui/primitives';
import { addAlias, addParent, CARBON_CHAIN_WORDS, CONCEPT_KIND_WORDS, knowledgeViewOf, moveAlias, removeAlias, removeParent, setAlias, setCarbonChain, setConceptKind, setDifficulty, setName, type KnowledgeText } from './knowledge-model';
import { choiceLine, RecordList, RecordPicker } from './record-picker';
import type { ParentKind, PickKind, RecordPickerPort } from './record-picker-contracts';
import type { SectionProps } from './section-props';
import { addConcept, removeConcept, setTextField, textOf } from './shared-model';
import { StringListEditor } from './string-list-editor';
import styles from './editor.module.css';

const bad = (props: SectionProps, path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);

export interface PickerSectionProps extends SectionProps {
  readonly picker?: RecordPickerPort | undefined;
}

export function NameAliasesSection(props: SectionProps & { readonly idPrefix: string }) {
  const view = knowledgeViewOf(props.draft);
  const { onEdit } = props;
  return (
    <div>
      <div className={styles.field}>
        <label htmlFor={`${props.idPrefix}-name`}>Name (required)</label>
        <input id={`${props.idPrefix}-name`} type="text" value={view.name} readOnly={props.unavailable !== undefined} aria-invalid={bad(props, 'name')} data-field-path="name" autoComplete="off" spellCheck={false} onChange={(event) => onEdit(setName(event.target.value), 'name')} />
      </div>
      <StringListEditor
        title="Aliases"
        one="Alias"
        items={view.aliases}
        path="aliases"
        invalid={props.invalid}
        unavailable={props.unavailable}
        phone={props.phone}
        onSet={(index, value, path) => onEdit(setAlias(index, value), path)}
        onAdd={() => onEdit(addAlias())}
        onRemove={(index) => onEdit(removeAlias(index))}
        onMove={(index, by) => onEdit(moveAlias(index, by))}
      />
    </div>
  );
}

export function ConceptKindField(props: SectionProps) {
  const view = knowledgeViewOf(props.draft);
  return (
    <div className={styles.field}>
      <label htmlFor="concept-kind">Kind of concept</label>
      <select id="concept-kind" value={view.conceptKind} disabled={props.unavailable !== undefined} aria-invalid={bad(props, 'conceptKind')} data-field-path="conceptKind" onChange={(event) => props.onEdit(setConceptKind(event.target.value), 'conceptKind')}>
        <option value="">Choose a kind</option>
        {CONCEPT_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {CONCEPT_KIND_WORDS[kind]}
          </option>
        ))}
      </select>
    </div>
  );
}

/** "Not set" or 1 to 5: the numbers have no meaning in the docs, so none is invented. */
export function DifficultyField(props: SectionProps) {
  const view = knowledgeViewOf(props.draft);
  return (
    <div className={styles.field}>
      <label htmlFor="knowledge-difficulty">Difficulty</label>
      <select id="knowledge-difficulty" value={view.difficulty} disabled={props.unavailable !== undefined} aria-invalid={bad(props, 'difficulty')} data-field-path="difficulty" onChange={(event) => props.onEdit(setDifficulty(event.target.value), 'difficulty')}>
        <option value="">Not set</option>
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={String(n)}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CarbonChainField(props: SectionProps) {
  const view = knowledgeViewOf(props.draft);
  return (
    <div className={styles.field}>
      <label htmlFor="carbon-chain">Carbon chain change</label>
      <select id="carbon-chain" value={view.carbonChain} disabled={props.unavailable !== undefined} aria-invalid={bad(props, 'carbonChainChange')} data-field-path="carbonChainChange" onChange={(event) => props.onEdit(setCarbonChain(event.target.value), 'carbonChainChange')}>
        <option value="">Not stated</option>
        {CARBON_CHAIN_CHANGES.map((change) => (
          <option key={change} value={change}>
            {CARBON_CHAIN_WORDS[change]}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A one-line text (`ShortText` in the schema): empty means absent. */
export function ShortTextField(props: SectionProps & { readonly field: KnowledgeText; readonly label: string; readonly hint?: string }) {
  const id = `knowledge-${props.field}`;
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{props.label}</label>
      <input id={id} type="text" value={textOf(props.draft, props.field)} readOnly={props.unavailable !== undefined} aria-invalid={bad(props, props.field)} data-field-path={props.field} autoComplete="off" spellCheck={false} onChange={(event) => props.onEdit(setTextField(props.field, event.target.value), props.field)} />
      {props.hint === undefined ? null : <p className={styles.hint}>{props.hint}</p>}
    </div>
  );
}

const PARENT_WORDS: Readonly<Record<ParentKind, { readonly list: string; readonly find: string; readonly noun: string; readonly results: string }>> = {
  class: { list: 'Parent classes', find: 'Find a parent class by name', noun: 'class', results: 'Classes found' },
  concept: { list: 'Parent concepts', find: 'Find a parent concept by name', noun: 'concept', results: 'Concepts found' },
  named_reaction: { list: 'Parent named reactions', find: 'Find a parent named reaction by name', noun: 'named reaction', results: 'Named reactions found' },
};

/** Parents of a concept or a named reaction; the cycle question is asked before Save and the reason is shown instead of a button. */
export function KnowledgeParentsSection(props: PickerSectionProps & { readonly kind: 'concept' | 'named_reaction' }) {
  const view = knowledgeViewOf(props.draft);
  const words = PARENT_WORDS[props.kind];
  const { picker } = props;
  return (
    <div>
      <RecordList label={words.list} fieldPath="parentIds" items={view.parentIds.map((id) => ({ kind: props.kind, id }))} port={picker} unavailable={props.unavailable} emptyText="None: a top-level record." onRemove={(index) => props.onEdit(removeParent(index))} />
      <RecordPicker
        id={`${props.kind}-parent-search`}
        label={words.find}
        kinds={[props.kind]}
        port={picker}
        noun={words.noun}
        resultsLabel={words.results}
        unavailable={props.unavailable}
        isListed={(choice) => view.parentIds.includes(choice.id)}
        refusal={(choice) => picker?.parentRefusal?.(view.id, choice.id, props.kind)}
        onPick={(choice) => props.onEdit(addParent(choice.id))}
      />
    </div>
  );
}

/** A list of records of one kind in an ID-list field (the transformation's from and to classes): a list with Remove and a picker. */
export function LinkedRecordsSection(props: PickerSectionProps & { readonly field: string; readonly kind: PickKind; readonly label: string; readonly findLabel: string; readonly noun: string; readonly resultsLabel: string; readonly ids: readonly string[] }) {
  const { picker } = props;
  return (
    <div>
      <RecordList label={props.label} fieldPath={props.field} items={props.ids.map((id) => ({ kind: props.kind, id }))} port={picker} unavailable={props.unavailable} emptyText="None." onRemove={(index) => props.onEdit(removeConcept(index, props.field))} />
      <RecordPicker id={`${props.field}-search`} label={props.findLabel} kinds={[props.kind]} port={picker} noun={props.noun} resultsLabel={props.resultsLabel} unavailable={props.unavailable} isListed={(choice) => props.ids.includes(choice.id)} onPick={(choice) => props.onEdit(addConcept(choice.id, props.field))} />
    </div>
  );
}

/** The reactions that name this record: derived from the reactions' links (nothing is stored here), each with a way to open it. */
export function UsedBySection(props: { readonly kind: 'named_reaction' | 'transformation'; readonly id: string; readonly picker?: RecordPickerPort | undefined; readonly openRecord?: ((ref: RecordRef) => void) | undefined }) {
  const users = props.picker?.usedBy?.(props.kind, props.id) ?? [];
  return (
    <div className={styles.list}>
      <h4>Used by</h4>
      {users.length === 0 ? <p className={styles.hint}>No reaction names this one yet.</p> : null}
      {users.length === 0 ? null : (
        <ul aria-label="Used by" className={styles.chips}>
          {users.map((user) => (
            <li key={user.id} className={styles.chip}>
              <span>{choiceLine(user, user.id)}</span>
              {props.openRecord === undefined ? null : (
                <Button aria-label={`Open ${user.name} in the inspector`} onClick={() => props.openRecord?.({ kind: 'reaction', id: user.id } as RecordRef)}>
                  Open
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className={styles.hint}>Derived from the reactions that name it. To change it, edit the reaction.</p>
    </div>
  );
}

/** A future seam shown as read-only text and kept unchanged by Save (reaction SMARTS). Nothing when the draft has none. */
export function KeptTextSection(props: { readonly label: string; readonly value: string }) {
  if (props.value === '') return null;
  return (
    <div className={styles.field}>
      <p>
        {props.label} <span className={styles.hint}>(read-only; kept unchanged)</span>
      </p>
      <p>
        <code>{props.value}</code>
      </p>
    </div>
  );
}
