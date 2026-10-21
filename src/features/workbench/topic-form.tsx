/**
 * The topic form (step 6.6c part 2, M1): Identity (name, aliases, kind of topic with no default, parent, order with no default),
 * Summary and notes, tags and citations, "Mapped records" (the mappings to this topic, read-only, each with a way to open the record,
 * and "Map a record to this topic"), and Review. The parent cannot close a cycle: the options the guard refuses are disabled with the
 * reason. Collapsible and keyboard-navigable (SectionFrame); a phone starts with the long sections closed.
 */
import type { RecordKind, RecordRef } from '@/core/schema';
import { TOPIC_KINDS } from '@/core/schema';
import { Button } from '@/ui/primitives';
import { numberField, setChoice, setNumber, textField, TOPIC_KIND_WORDS } from './curriculum-model';
import { NameAliasesSection, type PickerSectionProps } from './knowledge-sections';
import { NumberField } from './number-field';
import type { TopicChoice } from './record-picker-contracts';
import { SectionFrame } from './section-frame';
import { SharedFieldsSection } from './shared-bundle';
import { ReviewSection } from './species-sections';
import styles from './editor.module.css';

export interface TopicFormProps extends PickerSectionProps {
  readonly saved?: boolean | undefined;
  readonly openRecord?: ((ref: RecordRef) => void) | undefined;
  readonly startNew?: ((kind: RecordKind, seed: Readonly<Record<string, unknown>>) => void) | undefined;
}

const bad = (props: PickerSectionProps, path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);

/** "Before: A (order 4). After: B (order 9)." among the other topics under the same parent, for the order typed. */
export function orderHint(siblings: readonly TopicChoice[], order: number | undefined): string {
  if (order === undefined) return 'The order among the topics under the same parent; fractions such as 2.5 fit between 2 and 3.';
  const before = siblings.filter((s) => s.order < order).sort((a, b) => b.order - a.order)[0];
  const after = siblings.filter((s) => s.order > order).sort((a, b) => a.order - b.order)[0];
  const same = siblings.filter((s) => s.order === order);
  const said = [`Before: ${before === undefined ? 'none' : `${before.name} (order ${before.order})`}.`, `After: ${after === undefined ? 'none' : `${after.name} (order ${after.order})`}.`];
  return same.length === 0 ? said.join(' ') : `${said.join(' ')} The same order as ${same.map((s) => s.name).join(', ')}.`;
}

function ParentSelect(props: PickerSectionProps & { readonly topics: readonly TopicChoice[] }) {
  const parentId = textField(props.draft, 'parentId');
  const self = textField(props.draft, 'id');
  const known = props.topics.some((t) => t.id === parentId);
  return (
    <div className={styles.field}>
      <label htmlFor="topic-parent">Parent topic</label>
      <select id="topic-parent" value={parentId} disabled={props.unavailable !== undefined} aria-invalid={bad(props, 'parentId')} data-field-path="parentId" onChange={(event) => props.onEdit(setChoice('parentId', event.target.value), 'parentId')}>
        <option value="">None (a top-level topic)</option>
        {parentId === '' || known ? null : <option value={parentId}>{parentId} (not in this dataset)</option>}
        {props.topics.map((topic) => {
          const why = topic.id === self ? 'a topic cannot be its own parent' : props.picker?.parentRefusal?.(self, topic.id, 'topic');
          return (
            <option key={topic.id} value={topic.id} disabled={why !== undefined}>
              {`${'– '.repeat(topic.depth)}${topic.name}${why === undefined ? '' : ` (${why.replace(/\.$/, '')})`}`}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function Identity(props: PickerSectionProps) {
  const topics = props.picker?.topics?.() ?? [];
  const kind = textField(props.draft, 'topicKind');
  const parentId = textField(props.draft, 'parentId');
  const self = textField(props.draft, 'id');
  const order = numberField(props.draft, 'order');
  const siblings = topics.filter((t) => (t.parentId ?? '') === parentId && t.id !== self);
  return (
    <div>
      <NameAliasesSection draft={props.draft} onEdit={props.onEdit} invalid={props.invalid} unavailable={props.unavailable} phone={props.phone} idPrefix="topic" />
      <div className={styles.field}>
        <label htmlFor="topic-kind">Kind of topic</label>
        <select id="topic-kind" value={kind} disabled={props.unavailable !== undefined} aria-invalid={bad(props, 'topicKind')} data-field-path="topicKind" onChange={(event) => props.onEdit(setChoice('topicKind', event.target.value), 'topicKind')}>
          <option value="">Choose a kind</option>
          {TOPIC_KINDS.map((value) => (
            <option key={value} value={value}>
              {TOPIC_KIND_WORDS[value]}
            </option>
          ))}
        </select>
      </div>
      <ParentSelect {...props} topics={topics} />
      <NumberField id="topic-order" label="Order" path="order" value={order} invalid={bad(props, 'order') === true} unavailable={props.unavailable} hint={orderHint(siblings, order)} onChange={(value) => props.onEdit(setNumber('order', value), 'order')} />
    </div>
  );
}

function MappedRecords(props: TopicFormProps) {
  const id = textField(props.draft, 'id');
  const lines = props.picker?.mappedRecordsOf?.(id) ?? [];
  return (
    <div>
      {lines.length === 0 ? <p className={styles.hint}>No record is mapped to this topic yet.</p> : null}
      {lines.length === 0 ? null : (
        <ul aria-label="Mapped records" className={styles.chips}>
          {lines.map((line) => (
            <li key={line.id} className={styles.chip}>
              <span>{line.words}</span>
              {props.openRecord === undefined ? null : (
                <Button aria-label={`Open ${line.words} in the inspector`} onClick={() => props.openRecord?.(line.target as RecordRef)}>
                  Open
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Button {...(props.startNew === undefined ? { unavailable: 'not available here' } : props.saved === true ? { onClick: () => props.startNew?.('topic_mapping', { topicId: id }) } : { unavailable: 'save the topic first' })}>Map a record to this topic</Button>
      <p className={styles.hint}>Derived from the topic mappings. To change one, open it in the inspector and edit it there.</p>
    </div>
  );
}

export function TopicForm(props: TopicFormProps) {
  const open = props.phone !== true;
  const common = { draft: props.draft, onEdit: props.onEdit, ...(props.invalid === undefined ? {} : { invalid: props.invalid }), ...(props.unavailable === undefined ? {} : { unavailable: props.unavailable }), ...(props.phone === undefined ? {} : { phone: props.phone }) };
  return (
    <div className={styles.sections} data-editor-sections="">
      <SectionFrame id="identity" title="Identity">
        <Identity {...common} picker={props.picker} />
      </SectionFrame>
      <SectionFrame id="shared" title="Summary, notes, tags and citations" initiallyOpen={open}>
        <SharedFieldsSection {...common} notes={['summary', 'notes']} picker={props.picker} />
      </SectionFrame>
      <SectionFrame id="mapped" title="Mapped records" initiallyOpen={false}>
        <MappedRecords {...props} />
      </SectionFrame>
      <SectionFrame id="review" title="Review" initiallyOpen={open}>
        <ReviewSection {...common} />
      </SectionFrame>
    </div>
  );
}
