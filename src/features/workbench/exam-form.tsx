/**
 * The exam form (exams step part 2, X1): the name, short name, authority and notes as the schema types them, its versions as summary
 * lines ("<label> · <status> · <n> units") with "Open", and "New version of this exam" (keeps the draft and opens a NEW exam version with
 * the exam filled in). No exam kind is asked: the schema has none. Tags, citations and review as every editor.
 */
import type { RecordKind, RecordRef } from '@/core/schema';
import { Button } from '@/ui/primitives';
import { TextField } from './exam-fields';
import { statusWord, unitsWord } from './exam-model';
import { textField } from './curriculum-model';
import type { PickerSectionProps } from './knowledge-sections';
import { SectionFrame } from './section-frame';
import { SharedFieldsSection } from './shared-bundle';
import { ReviewSection } from './species-sections';
import { SummaryLine } from './summary-line';
import styles from './editor.module.css';

export interface ExamFormProps extends PickerSectionProps {
  readonly saved?: boolean | undefined;
  readonly startNew?: ((kind: RecordKind, seed: Readonly<Record<string, unknown>>) => void) | undefined;
  readonly editRecord?: ((ref: RecordRef) => void) | undefined;
}

function Versions(props: ExamFormProps) {
  const id = textField(props.draft, 'id');
  const versions = props.saved === true ? (props.picker?.versionSummariesOf?.(id) ?? []) : [];
  return (
    <div>
      {versions.length === 0 ? (
        <p className={styles.hint}>This exam has no versions yet.</p>
      ) : (
        <ul aria-label="Versions of this exam" className={styles.chips}>
          {versions.map((version) => (
            <li key={version.id} className={styles.chip}>
              <span>
                <SummaryLine text={`${version.label} · ${statusWord(version.status)} · ${unitsWord(version.units)}`} />
              </span>
              {props.editRecord === undefined ? null : (
                <Button aria-label={`Open ${version.label}`} onClick={() => props.editRecord?.({ kind: 'exam_version', id: version.id } as RecordRef)}>
                  Open
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Button {...(props.startNew === undefined ? { unavailable: 'not available here' } : props.saved === true ? { onClick: () => props.startNew?.('exam_version', { examId: id }) } : { unavailable: 'save the exam first' })}>New version of this exam</Button>
      <p className={styles.hint}>The syllabus units and topic coverage belong to a version: open or add one to edit them.</p>
    </div>
  );
}

export function ExamForm(props: ExamFormProps) {
  const open = props.phone !== true;
  const common = { draft: props.draft, onEdit: props.onEdit, ...(props.invalid === undefined ? {} : { invalid: props.invalid }), ...(props.unavailable === undefined ? {} : { unavailable: props.unavailable }), ...(props.phone === undefined ? {} : { phone: props.phone }) };
  const field = (id: string, label: string, path: string, required = false, hint?: string) => (
    <TextField id={id} label={label} path={path} value={textField(props.draft, path)} required={required} {...(hint === undefined ? {} : { hint })} invalid={props.invalid?.has(path) === true} unavailable={props.unavailable} onEdit={props.onEdit} />
  );
  return (
    <div className={styles.sections} data-editor-sections="">
      <SectionFrame id="identity" title="Identity">
        {field('exam-name', 'Name (required)', 'name', true)}
        {field('exam-short-name', 'Short name', 'shortName', false, 'Optional: a short form of the name.')}
        {field('exam-authority', 'Authority', 'authority', false, 'Optional: the body that sets the exam.')}
      </SectionFrame>
      <SectionFrame id="shared" title="Notes, tags and citations" initiallyOpen={open}>
        <SharedFieldsSection {...common} notes={['notes']} picker={props.picker} />
      </SectionFrame>
      <SectionFrame id="versions" title="Versions">
        <Versions {...props} />
      </SectionFrame>
      <SectionFrame id="review" title="Review" initiallyOpen={open}>
        <ReviewSection {...common} />
      </SectionFrame>
    </div>
  );
}
