/**
 * The read-only curriculum lists every record editor shows (step 6.6c): "Syllabus topics" (the topic mappings of this record, each with a
 * way to open the topic, and "Map to a topic") and, from part 3, "Exam relevance". They are derived through the port; nothing is edited
 * here. "Map to a topic" keeps this draft, closes the editor and opens a NEW mapping with this record already filled in. A record that is
 * not saved yet cannot be mapped (the mapping would point at nothing), and the button says so.
 */
import type { RecordKind, RecordRef } from '@/core/schema';
import { Button } from '@/ui/primitives';
import type { RecordPickerPort } from './record-picker-contracts';
import { SectionFrame } from './section-frame';
import styles from './editor.module.css';

export interface CurriculumListProps {
  readonly kind: string;
  readonly id: string;
  readonly saved: boolean;
  readonly picker?: RecordPickerPort | undefined;
  readonly openRecord?: ((ref: RecordRef) => void) | undefined;
  readonly startNew?: ((kind: RecordKind, seed: Readonly<Record<string, unknown>>) => void) | undefined;
}

const startButton = (props: CurriculumListProps, label: string, kind: RecordKind) => (
  <Button {...(props.startNew === undefined ? { unavailable: 'not available here' } : props.saved ? { onClick: () => props.startNew?.(kind, { target: { kind: props.kind, id: props.id } }) } : { unavailable: 'save the record first' })}>{label}</Button>
);

export function ExamRelevanceSection(props: CurriculumListProps) {
  const lines = props.picker?.relevanceLinesOf?.({ kind: props.kind, id: props.id }) ?? [];
  return (
    <SectionFrame id="exam-relevance" title="Exam relevance" initiallyOpen={false}>
      {lines.length === 0 ? <p className={styles.hint}>No exam relevance is marked for this record.</p> : null}
      {lines.length === 0 ? null : (
        <ul aria-label="Exam relevance" className={styles.chips}>
          {lines.map((line) => (
            <li key={line.id} className={styles.chip}>
              <span>{line.words}</span>
              {props.openRecord === undefined ? null : (
                <Button aria-label={`Open ${line.words} in the inspector`} onClick={() => props.openRecord?.({ kind: 'exam_relevance', id: line.id } as RecordRef)}>
                  Open
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {startButton(props, 'Mark exam relevance', 'exam_relevance')}
    </SectionFrame>
  );
}

export function SyllabusTopicsSection(props: CurriculumListProps) {
  const lines = props.picker?.topicLinesOf?.({ kind: props.kind, id: props.id }) ?? [];
  return (
    <SectionFrame id="syllabus" title="Syllabus topics" initiallyOpen={false}>
      {lines.length === 0 ? <p className={styles.hint}>Not mapped to a topic.</p> : null}
      {lines.length === 0 ? null : (
        <ul aria-label="Syllabus topics" className={styles.chips}>
          {lines.map((line) => (
            <li key={line.id} className={styles.chip}>
              <span>{line.words}</span>
              {props.openRecord === undefined ? null : (
                <Button aria-label={`Open ${line.words.split(' · ')[0] ?? line.words} in the inspector`} onClick={() => props.openRecord?.({ kind: 'topic', id: line.topicId } as RecordRef)}>
                  Open
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {startButton(props, 'Map to a topic', 'topic_mapping')}
    </SectionFrame>
  );
}
