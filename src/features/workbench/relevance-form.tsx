/**
 * The exam relevance form (step 6.6c part 3, M3): the record (the picker), the exam ("Choose an exam"), the versions of THAT exam (none
 * chosen means every version of the exam, said in words; a version of another exam is never hidden: it stays ticked with the reason),
 * the scope ("Choose a scope", four plain words), the importance ("Not set" or 1 to 5), a note, tags, citations and review. Nothing has
 * a default. CUR-003 and CUR-004 are the rules', live in the findings panel; this form only keeps the choices honest.
 */
import { useState } from 'react';
import type { DraftRecipe } from '@/core/editing';
import { numberField, SCOPE_WORDS, SCOPES, setChoice, setNumber, textField } from './curriculum-model';
import type { PickerSectionProps } from './knowledge-sections';
import { SectionFrame } from './section-frame';
import { SharedFieldsSection } from './shared-bundle';
import { ReviewSection } from './species-sections';
import { TargetField } from './target-field';
import styles from './editor.module.css';

const bad = (props: PickerSectionProps, path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);

const versionsOf = (draft: unknown): readonly string[] => {
  const value = (draft as { examVersionIds?: unknown } | null)?.examVersionIds;
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
};
const setExam = (examId: string): DraftRecipe => (draft) => {
  if (examId === '') Reflect.deleteProperty(draft, 'examId');
  else draft.examId = examId;
  draft.examVersionIds = [];
};
const toggleVersion = (id: string, on: boolean): DraftRecipe => (draft) => {
  const current = versionsOf(draft);
  draft.examVersionIds = on ? [...current.filter((v) => v !== id), id] : current.filter((v) => v !== id);
};

function ExamAndVersions(props: PickerSectionProps) {
  const [cleared, setCleared] = useState<string | null>(null);
  const exams = props.picker?.exams?.() ?? [];
  const examId = textField(props.draft, 'examId');
  const examName = exams.find((e) => e.id === examId)?.name ?? examId;
  const own = props.picker?.versionsOf?.(examId) ?? [];
  const chosen = versionsOf(props.draft);
  const labelOfAny = (id: string): string => exams.flatMap((e) => props.picker?.versionsOf?.(e.id) ?? []).find((v) => v.id === id)?.label ?? id;
  const strays = chosen.filter((id) => !own.some((v) => v.id === id));
  const locked = props.unavailable !== undefined;
  return (
    <div>
      <div className={styles.field}>
        <label htmlFor="relevance-exam">Exam</label>
        <select
          id="relevance-exam"
          value={examId}
          disabled={locked}
          aria-invalid={bad(props, 'examId')}
          data-field-path="examId"
          onChange={(event) => {
            setCleared(chosen.length > 0 ? `The versions of ${examName} were cleared because the exam changed.` : null);
            props.onEdit(setExam(event.target.value), 'examId');
          }}
        >
          <option value="">Choose an exam</option>
          {examId === '' || exams.some((e) => e.id === examId) ? null : <option value={examId}>{examId} (not in this dataset)</option>}
          {exams.map((exam) => (
            <option key={exam.id} value={exam.id}>
              {exam.name}
            </option>
          ))}
        </select>
      </div>
      {cleared === null ? null : (
        <p className={styles.notice} role="status" aria-label="Versions cleared">
          {cleared}
        </p>
      )}
      {examId === '' ? (
        <p className={styles.hint}>Choose an exam first: the versions are that exam&apos;s.</p>
      ) : (
        <div role="group" aria-label={`Versions of ${examName}`} data-field-path="examVersionIds" aria-invalid={bad(props, 'examVersionIds')}>
          {[...own.map((v) => ({ ...v, stray: false })), ...strays.map((id) => ({ id, label: labelOfAny(id), stray: true }))].map((version) => (
            <div key={version.id}>
              <label>
                <input type="checkbox" checked={chosen.includes(version.id)} disabled={locked} onChange={(event) => props.onEdit(toggleVersion(version.id, event.target.checked))} /> {version.label}
              </label>
              {version.stray ? <p className={styles.notice}>{`${version.label} is not a version of ${examName} (CUR-003): untick it, or choose its exam.`}</p> : null}
            </div>
          ))}
          <p className={styles.hint}>{chosen.length === 0 ? `Applies to all versions of ${examName}.` : `Applies to: ${chosen.map(labelOfAny).join(', ')}.`}</p>
        </div>
      )}
    </div>
  );
}

export function RelevanceForm(props: PickerSectionProps) {
  const open = props.phone !== true;
  const common = { draft: props.draft, onEdit: props.onEdit, ...(props.invalid === undefined ? {} : { invalid: props.invalid }), ...(props.unavailable === undefined ? {} : { unavailable: props.unavailable }), ...(props.phone === undefined ? {} : { phone: props.phone }) };
  const importance = numberField(props.draft, 'importance');
  return (
    <div className={styles.sections} data-editor-sections="">
      <SectionFrame id="relevance" title="Relevance">
        <TargetField {...common} picker={props.picker} />
        <ExamAndVersions {...common} picker={props.picker} />
        <div className={styles.field}>
          <label htmlFor="relevance-scope">Scope</label>
          <select id="relevance-scope" value={textField(props.draft, 'scope')} disabled={props.unavailable !== undefined} aria-invalid={bad(props, 'scope')} data-field-path="scope" onChange={(event) => props.onEdit(setChoice('scope', event.target.value), 'scope')}>
            <option value="">Choose a scope</option>
            {SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {SCOPE_WORDS[scope]}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="relevance-importance">Importance</label>
          <select id="relevance-importance" value={importance === undefined ? '' : String(importance)} disabled={props.unavailable !== undefined} aria-invalid={bad(props, 'importance')} data-field-path="importance" onChange={(event) => props.onEdit(setNumber('importance', event.target.value === '' ? undefined : Number(event.target.value)), 'importance')}>
            <option value="">Not set</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
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
