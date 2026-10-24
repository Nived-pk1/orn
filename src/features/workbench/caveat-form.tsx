/**
 * The caveat form (step 6.6b part 5, decision N6): Identity (kind of caveat with no default, title, importance), the texts (statement
 * required, rule, trigger, explanation), Trigger conditions (the SAME conditions form as a stage's), Targets (a record through the picker
 * and its role, "Choose a role"), Concepts, Notes, Tags, Citations and Review. CAV-001 and CAV-002 are the real rules, shown live by the
 * host. Collapsible and keyboard-navigable (SectionFrame); a phone starts with the long sections closed.
 */
import { useState } from 'react';
import { CAVEAT_KINDS, CAVEAT_TARGET_ROLES } from '@/core/schema';
import { Button } from '@/ui/primitives';
import { addTarget, CAVEAT_KIND_WORDS, caveatViewOf, IMPORTANCE_LEVELS, removeTarget, removeTriggerConditions, setCaveatKind, setImportance, setTargetRole, setTitle, TARGET_PICK_KINDS, TARGET_ROLE_WORDS } from './caveat-model';
import { ConditionFields } from './condition-fields';
import { caveatLoc, parametersOf, summaryOf } from './condition-model';
import conditionStyles from './condition.module.css';
import { wordsOfKind } from './knowledge-model';
import { choiceLine, RecordPicker } from './record-picker';
import type { RecordPickerPort } from './record-picker-contracts';
import { PicturesFrame } from './pictures-frame';
import { SectionFrame } from './section-frame';
import type { SectionProps } from './section-props';
import { NotesSection } from './shared-sections';
import { SharedFieldsSection } from './shared-bundle';
import { ReviewSection } from './species-sections';
import styles from './editor.module.css';

export interface CaveatFormProps extends SectionProps {
  readonly picker?: RecordPickerPort | undefined;
}

const bad = (props: SectionProps, path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);

function IdentitySection(props: SectionProps) {
  const view = caveatViewOf(props.draft);
  const locked = props.unavailable !== undefined;
  return (
    <div>
      <div className={styles.field}>
        <label htmlFor="caveat-kind">Kind of caveat</label>
        <select id="caveat-kind" value={view.caveatKind} disabled={locked} aria-invalid={bad(props, 'caveatKind')} data-field-path="caveatKind" onChange={(event) => props.onEdit(setCaveatKind(event.target.value), 'caveatKind')}>
          <option value="">Choose a kind</option>
          {CAVEAT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {CAVEAT_KIND_WORDS[kind]}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor="caveat-title">Title (required)</label>
        <input id="caveat-title" type="text" value={view.title} readOnly={locked} aria-invalid={bad(props, 'title')} data-field-path="title" autoComplete="off" spellCheck={false} onChange={(event) => props.onEdit(setTitle(event.target.value), 'title')} />
      </div>
      <div className={styles.field}>
        <label htmlFor="caveat-importance">Importance</label>
        <select id="caveat-importance" value={view.importance} disabled={locked} aria-invalid={bad(props, 'importance')} data-field-path="importance" onChange={(event) => props.onEdit(setImportance(event.target.value), 'importance')}>
          <option value="">Not set</option>
          {IMPORTANCE_LEVELS.map((level) => (
            <option key={level} value={level}>
              {wordsOfKind(level)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function TriggerSection(props: SectionProps) {
  const view = caveatViewOf(props.draft);
  const [editing, setEditing] = useState(false);
  const locked = props.unavailable;
  return (
    <div>
      <span className={conditionStyles.summary} data-testid="trigger-conditions">
        {view.hasTrigger ? summaryOf(parametersOf(props.draft, caveatLoc)) : 'No trigger conditions.'}
      </span>{' '}
      <Button aria-expanded={editing} onClick={() => setEditing(!editing)}>
        {editing ? 'Close trigger conditions' : 'Edit trigger conditions'}
      </Button>{' '}
      {!view.hasTrigger ? null : (
        <Button {...(locked === undefined ? { onClick: () => props.onEdit(removeTriggerConditions()) } : { unavailable: locked })}>Remove trigger conditions</Button>
      )}
      {!editing ? null : <ConditionFields draft={props.draft} onEdit={props.onEdit} loc={caveatLoc} who="the trigger" {...(props.invalid === undefined ? {} : { invalid: props.invalid })} {...(locked === undefined ? {} : { unavailable: locked })} {...(props.phone === undefined ? {} : { phone: props.phone })} />}
    </div>
  );
}

function TargetsSection(props: CaveatFormProps) {
  const view = caveatViewOf(props.draft);
  const { picker } = props;
  const locked = props.unavailable;
  return (
    <div>
      {view.targets.length === 0 ? <p className={styles.hint}>No targets: say what this caveat applies to (CAV-001).</p> : null}
      <ul aria-label="Targets" className={styles.chips}>
        {view.targets.map((target, index) => {
          const choice = picker?.describe(target.ref.kind as never, target.ref.id);
          const name = choice?.name ?? target.ref.id;
          return (
            <li key={`${target.ref.kind}:${target.ref.id}`} className={props.phone === true ? `${styles.row} ${styles.rowPhone}` : styles.row}>
              <span>{choiceLine(choice, target.ref.id)}</span>
              <select aria-label={`Role of ${name}`} value={target.role} disabled={locked !== undefined} aria-invalid={bad(props, `targets[${index}].as`)} data-field-path={`targets[${index}].as`} onChange={(event) => props.onEdit(setTargetRole(index, event.target.value), `targets[${index}].as`)}>
                <option value="">Choose a role</option>
                {CAVEAT_TARGET_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {TARGET_ROLE_WORDS[role]}
                  </option>
                ))}
              </select>
              <Button aria-label={`Remove target ${name}`} {...(locked === undefined ? { onClick: () => props.onEdit(removeTarget(index)) } : { unavailable: locked })}>
                Remove
              </Button>
            </li>
          );
        })}
      </ul>
      <RecordPicker
        id="caveat-target-search"
        label="Find a target record by name"
        kinds={TARGET_PICK_KINDS}
        port={picker}
        noun="record"
        resultsLabel="Records found"
        unavailable={locked}
        isListed={(choice) => view.targets.some((t) => t.ref.kind === choice.kind && t.ref.id === choice.id)}
        onPick={(choice) => props.onEdit(addTarget({ kind: choice.kind, id: choice.id }))}
      />
    </div>
  );
}

export function CaveatForm(props: CaveatFormProps) {
  const open = props.phone !== true;
  const common = { draft: props.draft, onEdit: props.onEdit, ...(props.invalid === undefined ? {} : { invalid: props.invalid }), ...(props.unavailable === undefined ? {} : { unavailable: props.unavailable }), ...(props.phone === undefined ? {} : { phone: props.phone }) };
  return (
    <div className={styles.sections} data-editor-sections="">
      <SectionFrame id="identity" title="Identity">
        <IdentitySection {...common} />
      </SectionFrame>
      <PicturesFrame kind="caveat" form={props} />
      <SectionFrame id="statement" title="Statement and explanation">
        <NotesSection {...common} fields={['statement', 'rule', 'trigger', 'explanation']} />
      </SectionFrame>
      <SectionFrame id="trigger-conditions" title="Trigger conditions" initiallyOpen={open}>
        <TriggerSection {...common} />
      </SectionFrame>
      <SectionFrame id="targets" title="Targets">
        <TargetsSection {...common} picker={props.picker} />
      </SectionFrame>
      <SectionFrame id="shared" title="Concepts, notes, tags and citations" initiallyOpen={open}>
        <SharedFieldsSection {...common} notes={['notes']} concepts picker={props.picker} />
      </SectionFrame>
      <SectionFrame id="review" title="Review" initiallyOpen={open}>
        <ReviewSection {...common} />
      </SectionFrame>
    </div>
  );
}
