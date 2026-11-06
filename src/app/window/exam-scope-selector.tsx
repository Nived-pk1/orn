/**
 * The exam selector of the top bar (step 5.8, reworked in step 8.3b; JEE_ONTOLOGY §3, §4; ADR-046): a native select with "All exams" and every
 * EXAM by its display name. The version used is the exam's current one (`currentVersionOf`: the newest official, else the newest provisional;
 * then a small "provisional" word). Studio also shows a Version select (the author tool: any version, drafts too). With an exam chosen, a
 * two-choice switch "Only <exam> | Everything" says whether records outside it are hidden (every view reads it). The choice is the navigator's
 * `exam` UI store (saved in `uiState`). A saved choice whose exam is no longer in the data is reset to All and SAID (nothing silent).
 */
import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';
import type { CanonicalState, ExamVersion } from '@/core/schema';
import { useStoreSelector, type StateSource } from '@/ui/hooks';
import { SegmentedControl, useToasts } from '@/ui/primitives';
import type { ActiveExamStore } from '@/ui/state';
import { useStudyChrome } from '@/ui/study-chrome';
import { currentVersionOf, examChoicesOf, PROVISIONAL_TIP } from './exam-choice';
import { ALL_LABEL, EXAM_LABEL, examOptions } from './exam-scope';
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
  const chrome = useStudyChrome();
  const author = chrome.examStatusWords; // Studio's rule: the author sees versions and their status words
  const active = useStore(exam, (s) => s.active);
  const mode = useStore(exam, (s) => s.mode);
  const versions = useStoreSelector(store, versionsOf) as Readonly<Record<string, ExamVersion>>;
  const exams = useStoreSelector(store, examsOf);
  const slice = useMemo(() => ({ records: { exam: exams, exam_version: versions } }) as unknown as CanonicalState, [exams, versions]);
  const choices = useMemo(() => examChoicesOf(slice, { allowDraft: author }), [slice, author]);
  const toasts = useToasts();
  const chosen = active === null ? undefined : choices.find((choice) => choice.examId === active.examId);
  const version = active === null ? undefined : versions[active.examVersionId];
  const versionList = useMemo(() => (active === null ? [] : examOptions(slice).options.filter((option) => option.examId === active.examId)), [slice, active]);
  const missing = active !== null && (chosen === undefined || version === undefined || version.examId !== active.examId);
  useEffect(() => {
    if (!missing || !hasData || active === null) return;
    // the saved (or imported-over) choice names an exam or a version this data does not have: back to All, said in words
    exam.getState().setActive(null);
    toasts.push({ kind: 'warning', text: 'The exam you had chosen is not in this data, so all records are shown.' });
    log('exam_scope_reset', `the chosen exam version ${active.examVersionId} is not in the data; the exam scope was reset to All`);
  }, [missing, hasData, active, exam, log, toasts]);
  // the student never picks a version: a saved older one is brought to the exam's current one
  const currentId = active === null ? undefined : currentVersionOf(Object.values(versions), active.examId)?.id;
  useEffect(() => {
    if (author || active === null || missing || currentId === undefined || currentId === active.examVersionId) return;
    exam.getState().setActive({ examId: active.examId, examVersionId: currentId as typeof active.examVersionId });
  }, [author, active, missing, currentId, exam]);
  const examName = chosen?.name;
  return (
    <span className={styles.examScope}>
      <label>
        <span className={styles.examLabel}>{EXAM_LABEL} </span>
        <select
          value={active === null || chosen === undefined ? ALL : active.examId}
          onChange={(event) => {
            const choice = choices.find((one) => one.examId === event.target.value);
            exam.getState().setActive(choice === undefined ? null : { examId: choice.examId as never, examVersionId: choice.versionId as never });
            if (choice !== undefined) exam.getState().setMode('only'); // Only is the default when an exam is chosen
          }}
        >
          <option value={ALL}>{ALL_LABEL}</option>
          {choices.map((choice) => (
            <option key={choice.examId} value={choice.examId}>
              {choice.name}
            </option>
          ))}
        </select>
      </label>
      {!author && chosen?.provisional === true && version?.status !== 'official' ? (
        <span className={styles.provisional} title={PROVISIONAL_TIP}>
          provisional
        </span>
      ) : null}
      {author && active !== null && versionList.length > 0 ? (
        <label>
          <span className={styles.examLabel}>Version </span>
          <select
            value={active.examVersionId}
            onChange={(event) => {
              const option = versionList.find((one) => one.examVersionId === event.target.value);
              if (option !== undefined) exam.getState().setActive({ examId: option.examId, examVersionId: option.examVersionId });
            }}
          >
            {versionList.map((option) => (
              <option key={option.examVersionId} value={option.examVersionId}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {examName === undefined ? null : (
        <SegmentedControl
          label="Show"
          options={[
            { value: 'only', label: `Only ${examName}` },
            { value: 'everything', label: 'Everything' },
          ]}
          value={mode}
          onChange={(next) => exam.getState().setMode(next)}
        />
      )}
    </span>
  );
}
