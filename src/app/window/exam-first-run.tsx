/**
 * The first-run exam card (step 8.3b, B3; a lazy chunk, Study only). The app never guesses an exam (JEE_ONTOLOGY §3):
 * the first time a student opens it a card asks "Which exam are you preparing for?" with one chip per exam and "Just exploring" (= All exams).
 * Answering sets the exam (with its current version) and "Only <exam>", and the card never comes back; closing it counts as "Just exploring".
 */
import { useMemo } from "react";
import { useStore } from "zustand";
import type { CanonicalState, ExamVersion } from "@/core/schema";
import { useStoreSelector } from "@/ui/hooks";
import { examChoicesOf, type ExamChoice } from "./exam-choice";
import { ExamPicker } from "./exam-picker";
import type { ExamScopeBinding } from "./exam-scope-selector";

function useChoices(binding: ExamScopeBinding): readonly ExamChoice[] {
  const exams = useStoreSelector(binding.store, (state: CanonicalState) => state.records.exam);
  const versions = useStoreSelector(binding.store, (state: CanonicalState) => state.records.exam_version) as Readonly<Record<string, ExamVersion>>;
  return useMemo(() => examChoicesOf({ records: { exam: exams, exam_version: versions } } as unknown as CanonicalState), [exams, versions]);
}

/** The answer: an exam (its current version, "Only") or none (All exams). Either way the question is answered. */
function answer(binding: ExamScopeBinding, choice: ExamChoice | null): void {
  const state = binding.exam.getState();
  state.setActive(choice === null ? null : { examId: choice.examId as never, examVersionId: choice.versionId as never });
  if (choice !== null) state.setMode('only');
  state.setAsked(true);
}

export function ExamFirstRun(props: { readonly binding: ExamScopeBinding }) {
  const { binding } = props;
  const asked = useStore(binding.exam, (s) => s.asked);
  const choices = useChoices(binding);
  if (asked || !binding.hasData || choices.length === 0) return null;
  return <ExamPicker open title="Which exam are you preparing for?" choices={choices} onChoose={(choice) => answer(binding, choice)} onClose={() => answer(binding, null)} />;
}
