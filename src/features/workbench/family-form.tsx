/**
 * The map family form (step 6.6c part 4, M4): the class (a navigator anchor's target), the label (optional; the map shows the class name
 * when empty), the group (an existing one or a new one), the tone (fixed for an existing group, "Choose a tone" for a new one), the order
 * (no default; the hint names the families around it) and the cell on a grid of the current arrangement. A presentation record: no notes,
 * tags or review. One family per class (PRS-002) and one family per cell (PRS-004) are the rules'; the form says at once when the class
 * already has one. Removing a family from the map arrives with deleting (step 6.8).
 */
import { useState } from 'react';
import { ANCHOR_TONES, type RecordRef } from '@/core/schema';
import { Button } from '@/ui/primitives';
import { numberField, refField, setNumber, setRef } from './curriculum-model';
import { FamilyGrid } from './family-grid';
import { familyViewOf, groupsOf, NEW_GROUP, setGroup, setLabel, setTone, TONE_WORDS } from './family-model';
import type { PickerSectionProps } from './knowledge-sections';
import { useAfterLastOrder } from './order-default';
import { NumberField } from './number-field';
import { RecordList, RecordPicker } from './record-picker';
import { useRemove } from './remove-context';
import { orderHint } from './topic-form';
import { SectionFrame } from './section-frame';
import styles from './editor.module.css';

const bad = (props: PickerSectionProps, path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);

function ClassField(props: PickerSectionProps) {
  const target = refField(props.draft, 'target');
  if (target !== undefined) {
    return (
      <div data-field-path="target" aria-invalid={bad(props, 'target')}>
        <RecordList label="Class" fieldPath="target" items={[{ kind: 'class', id: target.id }]} port={props.picker} unavailable={props.unavailable} onRemove={() => props.onEdit(setRef('target', undefined))} />
      </div>
    );
  }
  return (
    <div data-field-path="target" aria-invalid={bad(props, 'target')}>
      <RecordPicker id="family-class-search" label="Find the class by name" kinds={['class']} port={props.picker} noun="class" resultsLabel="Classes found" unavailable={props.unavailable} isListed={() => false} onPick={(choice) => props.onEdit(setRef('target', { kind: 'class', id: choice.id }))} />
    </div>
  );
}

function GroupAndTone(props: PickerSectionProps) {
  const view = familyViewOf(props.draft);
  const families = props.picker?.mapFamilies?.() ?? [];
  const groups = groupsOf(families, view.id);
  const existing = groups.find((g) => g.name === view.group);
  const [creating, setCreating] = useState(false);
  const mode = creating || (view.group !== '' && existing === undefined) ? NEW_GROUP : view.group;
  const locked = props.unavailable !== undefined;
  const toneFixed = view.group !== '' && existing?.tone !== undefined;
  return (
    <div>
      <div className={styles.field}>
        <label htmlFor="family-group">Group</label>
        <select
          id="family-group"
          value={mode}
          disabled={locked}
          aria-invalid={bad(props, 'group')}
          data-field-path="group"
          onChange={(event) => {
            const value = event.target.value;
            setCreating(value === NEW_GROUP);
            if (value === NEW_GROUP) props.onEdit(setGroup('', undefined), 'group');
            else props.onEdit(setGroup(value, groups.find((g) => g.name === value)?.tone), 'group');
          }}
        >
          <option value="">Choose a group</option>
          {groups.map((group) => (
            <option key={group.name} value={group.name}>
              {group.name}
            </option>
          ))}
          <option value={NEW_GROUP}>A new group...</option>
        </select>
      </div>
      {mode !== NEW_GROUP ? null : (
        <div className={styles.field}>
          <label htmlFor="family-group-name">Name of the new group</label>
          <input id="family-group-name" type="text" value={view.group} readOnly={locked} autoComplete="off" data-field-path="group" onChange={(event) => props.onEdit(setGroup(event.target.value, groups.find((g) => g.name === event.target.value)?.tone), 'group')} />
        </div>
      )}
      {view.group === '' ? (
        <p className={styles.hint}>Tone: choose a group first (the tone belongs to the group).</p>
      ) : toneFixed ? (
        <p>{`Tone: ${view.tone === '' ? existing?.tone : view.tone} (the tone of the group ${view.group}; it is changed on its first family)`}</p>
      ) : (
        <div className={styles.field}>
          <label htmlFor="family-tone">Tone</label>
          <select id="family-tone" value={view.tone} disabled={locked} aria-invalid={bad(props, 'tone')} data-field-path="tone" onChange={(event) => props.onEdit(setTone(event.target.value), 'tone')}>
            <option value="">Choose a tone</option>
            {ANCHOR_TONES.map((tone) => (
              <option key={tone} value={tone}>
                {TONE_WORDS[tone]}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export function FamilyForm(props: PickerSectionProps) {
  const view = familyViewOf(props.draft);
  const remove = useRemove();
  const families = props.picker?.mapFamilies?.() ?? [];
  const className = view.targetId === '' ? '' : (props.picker?.describe('class', view.targetId)?.name ?? view.targetId);
  const others = families.filter((f) => f.id !== view.id && f.targetId === view.targetId && view.targetId !== '');
  const order = numberField(props.draft, 'order');
  const siblings = families.filter((f) => f.id !== view.id && (f.group ?? '') === view.group);
  const typed = useAfterLastOrder(order, siblings.map((f) => f.order), (value) => props.onEdit(setNumber('order', value), 'order'));
  const common = { draft: props.draft, onEdit: props.onEdit, ...(props.invalid === undefined ? {} : { invalid: props.invalid }), ...(props.unavailable === undefined ? {} : { unavailable: props.unavailable }), ...(props.phone === undefined ? {} : { phone: props.phone }) };
  return (
    <div className={styles.sections} data-editor-sections="">
      <SectionFrame id="family" title="Family">
        <ClassField {...common} picker={props.picker} />
        {others.length === 0 ? null : <p className={styles.notice}>{`This class is already a map family (${others.map((f) => f.name).join(', ')}). A second one is ignored by the map (PRS-002 warns).`}</p>}
        <div className={styles.field}>
          <label htmlFor="family-label">Label (optional)</label>
          <input id="family-label" type="text" value={view.label} readOnly={props.unavailable !== undefined} aria-invalid={bad(props, 'label')} data-field-path="label" autoComplete="off" onChange={(event) => props.onEdit(setLabel(event.target.value), 'label')} />
          <p className={styles.hint}>{className === '' ? 'The map shows the class name when the label is empty.' : `The map shows the class name: ${className}.`}</p>
        </div>
        <GroupAndTone {...common} picker={props.picker} />
        <NumberField id="family-order" label="Order" path="order" value={order} invalid={bad(props, 'order') === true} unavailable={props.unavailable} hint={orderHint(siblings, order)} onChange={(value) => (typed(value), props.onEdit(setNumber('order', value), 'order'))} />
      </SectionFrame>
      <SectionFrame id="cell" title="Cell on the map">
        <FamilyGrid selfId={view.id} families={families} chosen={view.cell} unavailable={props.unavailable} invalid={bad(props, 'cell') === true} onEdit={props.onEdit} />
      </SectionFrame>
      {remove === undefined || !families.some((f) => f.id === view.id) ? null : (
        <p>
          <Button onClick={() => remove({ kind: 'navigator_anchor', id: view.id } as RecordRef)}>Remove from the map</Button>
        </p>
      )}
    </div>
  );
}
