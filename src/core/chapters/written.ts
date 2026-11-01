/**
 * A concept with no text (7.3c A3): no summary, no study notes and no notes is not a study card. The chapter list and page set such
 * concepts apart (Study hides them and does not count them; Studio lists them in one quiet line and counts them separately).
 */
import type { CanonicalState, RecordRef } from '../schema';

const hasText = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';

export function isUnwrittenConcept(state: CanonicalState, ref: RecordRef): boolean {
  if (ref.kind !== 'concept') return false;
  const concept = state.records.concept[ref.id];
  return concept !== undefined && !hasText(concept.summary) && !hasText(concept.studyNotes) && !hasText(concept.notes);
}
