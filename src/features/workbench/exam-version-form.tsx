/**
 * The exam version form (exams step part 2, X2): the exam ("Choose an exam", filled in when chained from the exam), the label, year and
 * dates as typed, the status ("Choose a status": no default; CUR-005 is the rule's, live in the findings panel), "Start from another
 * version" (a NEW version only: copies another version's units and coverage with new unit IDs, never the status), the syllabus units
 * with their topic coverage, notes, tags, citations (the 6.6a source editor supplies the syllabus document) and review.
 */
import { useState } from 'react';
import { EXAM_VERSION_STATUS } from '@/core/schema';
import { Button } from '@/ui/primitives';
import { TextField } from './exam-fields';
import { copyUnits, setText, setYearText, STATUS_WORDS, unitsOf } from './exam-model';
import { ExamUnits } from './exam-units';
import { setChoice, textField } from './curriculum-model';
import type { PickerSectionProps } from './knowledge-sections';
import { SectionFrame } from './section-frame';
import { SharedFieldsSection } from './shared-bundle';
import { ReviewSection } from './species-sections';
import styles from './editor.module.css';

export interface ExamVersionFormProps extends PickerSectionProps {
  readonly newId: (prefix: string) => string;
  readonly saved?: boolean | undefined;
}

const FIRST = 'Choose the exam first: the versions are the ones of that exam.';
const HAS_UNITS = 'This version already has units: remove them to start from another version.';
const COPIES = 'Copies the units and topic coverage of that version into this one. The status is not copied.';

function StartFrom(props: ExamVersionFormProps) {
  const [source, setSource] = useState('');
  const [said, setSaid] = useState<string | null>(null);
  const examId = textField(props.draft, 'examId');
  const self = textField(props.draft, 'id');
  const options = (props.picker?.versionsOf?.(examId) ?? []).filter((v) => v.id !== self);
  const hasUnits = unitsOf(props.draft).length > 0;
  const chosen = options.find((v) => v.id === source);
  const copy = (): void => {
    const units = props.picker?.unitsOfVersion?.(source);
    if (units === undefined || chosen === undefined) return;
    props.onEdit(copyUnits(units, props.newId));
    const rows = units.reduce((n, unit) => n + unit.topicCoverage.length, 0);
    const tail = textField(props.draft, 'status') === '' ? ' The status is still not chosen: choose it for this version.' : '';
    setSaid(`Copied ${units.length} ${units.length === 1 ? 'unit' : 'units'} and ${rows} coverage ${rows === 1 ? 'row' : 'rows'} from ${chosen.label}.${tail}`);
    setSource('');
  };
  return (
    <div>
      <div className={styles.field}>
        <label htmlFor="version-start-from">Start from another version</label>
        <select id="version-start-from" value={source} disabled={props.unavailable !== undefined || examId === ''} onChange={(event) => setSource(event.target.value)}>
          <option value="">Choose a version</option>
          {options.map((version) => (
            <option key={version.id} value={version.id}>
              {version.label}
            </option>
          ))}
        </select>
        <p className={styles.hint}>{examId === '' ? FIRST : hasUnits ? HAS_UNITS : COPIES}</p>
      </div>
      <Button {...(source === '' ? { unavailable: 'choose a version first' } : hasUnits ? { unavailable: 'this version already has units' } : props.unavailable !== undefined ? { unavailable: props.unavailable } : { onClick: copy })}>Copy its units and coverage</Button>
      {said === null ? null : (
        <p className={styles.notice} role="status" aria-label="Copied">
          {said}
        </p>
      )}
    </div>
  );
}

export function ExamVersionForm(props: ExamVersionFormProps) {
  const open = props.phone !== true;
  const common = { draft: props.draft, onEdit: props.onEdit, ...(props.invalid === undefined ? {} : { invalid: props.invalid }), ...(props.unavailable === undefined ? {} : { unavailable: props.unavailable }), ...(props.phone === undefined ? {} : { phone: props.phone }) };
  const exams = props.picker?.exams?.() ?? [];
  const examId = textField(props.draft, 'examId');
  const status = textField(props.draft, 'status');
  const rawYear = (props.draft as { year?: unknown } | null)?.year;
  const year = typeof rawYear === 'number' ? String(rawYear) : '';
  const bad = (path: string): boolean => props.invalid?.has(path) === true;
  const locked = props.unavailable !== undefined;
  return (
    <div className={styles.sections} data-editor-sections="">
      <SectionFrame id="identity" title="Identity">
        <div className={styles.field}>
          <label htmlFor="version-exam">Exam</label>
          <select id="version-exam" value={examId} disabled={locked} aria-invalid={bad('examId') ? true : undefined} data-field-path="examId" onChange={(event) => props.onEdit(setChoice('examId', event.target.value), 'examId')}>
            <option value="">Choose an exam</option>
            {examId === '' || exams.some((e) => e.id === examId) ? null : <option value={examId}>{examId} (not in this dataset)</option>}
            {exams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.name}
              </option>
            ))}
          </select>
        </div>
        <TextField id="version-label" label="Label (required)" path="label" value={textField(props.draft, 'label')} required hint="How this version is named in the exam scope selector, for example the exam and the year." invalid={bad('label')} unavailable={props.unavailable} onEdit={props.onEdit} />
        <TextField id="version-year" label="Year" path="year" value={year} make={setYearText} hint="Optional: a whole number." invalid={bad('year')} unavailable={props.unavailable} onEdit={props.onEdit} />
        <div className={styles.field}>
          <label htmlFor="version-status">Status</label>
          <select id="version-status" value={status} disabled={locked} aria-invalid={bad('status') ? true : undefined} data-field-path="status" onChange={(event) => props.onEdit(setChoice('status', event.target.value), 'status')}>
            <option value="">Choose a status</option>
            {EXAM_VERSION_STATUS.map((value) => (
              <option key={value} value={value}>
                {STATUS_WORDS[value]}
              </option>
            ))}
          </select>
          <p className={styles.hint}>Official needs a citation of the published syllabus document (add it under Citations).</p>
        </div>
        <TextField id="version-from" label="Effective from (YYYY-MM-DD)" path="effectiveFrom" value={textField(props.draft, 'effectiveFrom')} make={(value) => setText('effectiveFrom', value, false)} invalid={bad('effectiveFrom')} unavailable={props.unavailable} onEdit={props.onEdit} />
        <TextField id="version-to" label="Effective to (YYYY-MM-DD)" path="effectiveTo" value={textField(props.draft, 'effectiveTo')} make={(value) => setText('effectiveTo', value, false)} invalid={bad('effectiveTo')} unavailable={props.unavailable} onEdit={props.onEdit} />
      </SectionFrame>
      {props.saved === true ? null : (
        <SectionFrame id="start-from" title="Copy another version">
          <StartFrom {...props} />
        </SectionFrame>
      )}
      <SectionFrame id="units" title="Syllabus units">
        <ExamUnits {...common} picker={props.picker} newId={props.newId} />
      </SectionFrame>
      <SectionFrame id="shared" title="Notes, tags and citations" initiallyOpen={open}>
        <SharedFieldsSection {...common} notes={['notes']} picker={props.picker} />
      </SectionFrame>
      <SectionFrame id="review" title="Review" initiallyOpen={open}>
        <ReviewSection {...common} />
      </SectionFrame>
    </div>
  );
}
