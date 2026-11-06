/**
 * The exam card (step 8.3b, B3; a lazy chunk): "Which exam are you preparing for?" with one chip per exam and "Just exploring" (= All exams). The
 * Study first run shows it once; "Change exam" on a phone opens the same card. The student sees the exam's display name only. It reports the
 * choice and nothing else: the window sets the exam, the switch and the "asked" flag.
 */
import { Button, Dialog } from '@/ui/primitives';
import type { ExamChoice } from './exam-choice';
import styles from './exam-picker.module.css';

export interface ExamPickerProps {
  readonly open: boolean;
  readonly title: string;
  readonly choices: readonly ExamChoice[];
  /** The exam in use, marked (the "Change exam" card). */
  readonly chosenExamId?: string | undefined;
  /** `null`: Just exploring. */
  readonly onChoose: (choice: ExamChoice | null) => void;
  readonly onClose: () => void;
}

export function ExamPicker(props: ExamPickerProps) {
  return (
    <Dialog open={props.open} onClose={props.onClose} title={props.title}>
      <div className={styles.chips} data-exam-picker="">
        {props.choices.map((choice) => (
          <Button key={choice.examId} className={styles.chip} aria-pressed={props.chosenExamId === choice.examId} onClick={() => props.onChoose(choice)}>
            {choice.name}
          </Button>
        ))}
        <Button className={styles.chip} variant="quiet" onClick={() => props.onChoose(null)}>
          Just exploring
        </Button>
      </div>
    </Dialog>
  );
}
