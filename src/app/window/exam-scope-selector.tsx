/**
 * The exam-scope selector of the top bar (step 5.8; JEE_ONTOLOGY §3, §4): a native select with "All (no exam scope)" and every exam
 * version in the data, each named with its exam and its status in words. The choice is the navigator's `exam` UI store (saved in
 * `uiState`); it drives `scopeOf` for the projection, the family study and the inspector, and the search tie-breaks. A saved choice
 * whose exam version is no longer in the data is reset to All and SAID (nothing silent).
 */
import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';
import type { CanonicalState, ExamVersion } from '@/core/schema';
import { useStoreSelector, type StateSource } from '@/ui/hooks';
import { useToasts } from '@/ui/primitives';
import type { ActiveExamStore } from '@/ui/state';
import { ALL_LABEL, examOptions, labelOfChoice } from './exam-scope';
import styles from './window.module.css';

export interface ExamScopeBinding {
  readonly exam: ActiveExamStore;
  /** The canonical store (the exam versions and exams of the data now), and whether the data is loaded (a choice is not judged against an empty store). */
  readonly store: StateSource;
  readonly hasData: boolean;
  readonly log: (type: string, message: string) => void;
}

const ALL = '';
const examsOf = (state: CanonicalState) => state.records.exam;
const versionsOf = (state: CanonicalState) => state.records.exam_version;

export function ExamScopeSelector(props: { readonly binding: ExamScopeBinding }) {
  const { exam, store, hasData, log } = props.binding;
  const active = useStore(exam, (s) => s.active);
  const versions = useStoreSelector(store, versionsOf) as Readonly<Record<string, ExamVersion>>;
  const exams = useStoreSelector(store, examsOf);
  const { options, omitted } = useMemo(() => examOptions({ records: { exam: exams, exam_version: versions } } as unknown as CanonicalState), [exams, versions]);
  const toasts = useToasts();
  const chosen = active === null ? undefined : labelOfChoice(options, active.examVersionId);
  const missing = active !== null && chosen === undefined;
  useEffect(() => {
    if (!missing || !hasData || active === null) return;
    // the saved (or imported-over) choice names an exam version this data does not have: back to All, said in words
    exam.getState().setActive(null);
    toasts.push({ kind: 'warning', text: 'The exam scope you had chosen is not in this data, so all records are shown.' });
    log('exam_scope_reset', `the chosen exam version ${active.examVersionId} is not in the data; the exam scope was reset to All`);
  }, [missing, hasData, active, exam, log, toasts]);
  return (
    <span className={styles.examScope}>
      <label>
        <span className={styles.examLabel}>Exam scope </span>
        <select
          value={active === null || chosen === undefined ? ALL : active.examVersionId}
          onChange={(event) => {
            const option = options.find((o) => o.examVersionId === event.target.value);
            exam.getState().setActive(option === undefined ? null : { examId: option.examId, examVersionId: option.examVersionId });
          }}
        >
          <option value={ALL}>{ALL_LABEL}</option>
          {options.map((option) => (
            <option key={option.examVersionId} value={option.examVersionId}>
              {option.label}
            </option>
          ))}
          {omitted === 0 ? null : (
            <option disabled value="more">
              {omitted} more exam versions are not offered here
            </option>
          )}
        </select>
      </label>
    </span>
  );
}
