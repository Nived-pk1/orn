/**
 * The topic mapping form (step 6.6c part 2, M2): the topic ("Choose a topic"), the record it places (the picker over the kinds the
 * registry allows), the role ("Choose a role", core, supporting or enrichment), a note, tags, citations and review. Nothing has a
 * default. CUR-006 (the same record in the same topic twice) is the rule's, live in the findings panel; this form only keeps the choices honest.
 */
import { MAPPING_ROLES } from '@/core/schema';
import { refField, ROLE_WORDS, setChoice, textField } from './curriculum-model';
import type { PickerSectionProps } from './knowledge-sections';
import { SectionFrame } from './section-frame';
import { SharedFieldsSection } from './shared-bundle';
import { ReviewSection } from './species-sections';
import { TargetField } from './target-field';
import styles from './editor.module.css';

const bad = (props: PickerSectionProps, path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);

/** Every topic in tree order, indented by depth; the chosen topic stays listed even if it is not in the dataset. */
export function TopicSelect(props: PickerSectionProps) {
  const topics = props.picker?.topics?.() ?? [];
  const chosen = textField(props.draft, 'topicId');
  return (
    <div className={styles.field}>
      <label htmlFor="mapping-topic">Topic</label>
      <select id="mapping-topic" value={chosen} disabled={props.unavailable !== undefined} aria-invalid={bad(props, 'topicId')} data-field-path="topicId" onChange={(event) => props.onEdit(setChoice('topicId', event.target.value), 'topicId')}>
        <option value="">Choose a topic</option>
        {chosen === '' || topics.some((t) => t.id === chosen) ? null : <option value={chosen}>{chosen} (not in this dataset)</option>}
        {topics.map((topic) => (
          <option key={topic.id} value={topic.id}>
            {`${'– '.repeat(topic.depth)}${topic.name}`}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Tells at once when this record is already in this topic through ANOTHER mapping (derived; the rule CUR-006 flags only the later ID, so it may not name this draft). */
function AlreadyThere(props: PickerSectionProps) {
  const target = refField(props.draft, 'target');
  const topicId = textField(props.draft, 'topicId');
  const self = textField(props.draft, 'id');
  if (target === undefined || topicId === '') return null;
  const others = (props.picker?.topicLinesOf?.(target) ?? []).filter((line) => line.topicId === topicId && line.id !== self);
  if (others.length === 0) return null;
  return <p className={styles.notice}>{`Already in this topic through another mapping: ${others.map((line) => line.words.split(' · ')[1] ?? '').join(', ')}. Saving this adds a second one (CUR-006 warns).`}</p>;
}

export function MappingForm(props: PickerSectionProps) {
  const open = props.phone !== true;
  const common = { draft: props.draft, onEdit: props.onEdit, ...(props.invalid === undefined ? {} : { invalid: props.invalid }), ...(props.unavailable === undefined ? {} : { unavailable: props.unavailable }), ...(props.phone === undefined ? {} : { phone: props.phone }) };
  return (
    <div className={styles.sections} data-editor-sections="">
      <SectionFrame id="placement" title="Placement">
        <TopicSelect {...common} picker={props.picker} />
        <TargetField {...common} picker={props.picker} />
        <AlreadyThere {...common} picker={props.picker} />
        <div className={styles.field}>
          <label htmlFor="mapping-role">Role</label>
          <select id="mapping-role" value={textField(props.draft, 'role')} disabled={props.unavailable !== undefined} aria-invalid={bad(props, 'role')} data-field-path="role" onChange={(event) => props.onEdit(setChoice('role', event.target.value), 'role')}>
            <option value="">Choose a role</option>
            {MAPPING_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_WORDS[role]}
              </option>
            ))}
          </select>
        </div>
      </SectionFrame>
      <SectionFrame id="shared" title="Note, tags and citations" initiallyOpen={open}>
        <SharedFieldsSection {...common} notes={['note']} picker={props.picker} />
      </SectionFrame>
      <SectionFrame id="review" title="Review" initiallyOpen={open}>
        <ReviewSection {...common} />
      </SectionFrame>
    </div>
  );
}
