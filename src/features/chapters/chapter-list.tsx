/**
 * The list of chapters (step 7.3b D2): each chapter's title, the exam versions that cover it and its counts in words; "No chapter yet" last
 * (the records mapped nowhere). With an exam scope only the chapters that version covers are listed, in its order, and the count of the
 * hidden ones is said. A list longer than the limit is cut and says so.
 */
import { NO_CHAPTER, NO_CHAPTER_TITLE, type ChaptersList } from '@/core/chapters';
import type { ChaptersPorts } from './contracts';
import { chipWords } from './chapter-page';
import { countsWords } from './model';
import styles from './chapters-view.module.css';

/** The most chapters drawn at once; a dataset with more says so. */
export const MAX_CHAPTERS_SHOWN = 200;

export function ChapterList(props: { readonly ports: ChaptersPorts; readonly list: ChaptersList; readonly examName: string | undefined }) {
  const { ports, list } = props;
  const shown = list.chapters.slice(0, MAX_CHAPTERS_SHOWN);
  const open = (id: string): void => ports.ui.chapters.getState().open(id);
  return (
    <>
      {props.examName !== undefined && list.hiddenByExam > 0 ? (
        <p className={styles.muted}>{`${list.hiddenByExam} ${list.hiddenByExam === 1 ? 'chapter is' : 'chapters are'} hidden: not in ${props.examName}.`}</p>
      ) : null}
      {list.chapters.length === 0 && list.noChapter.total === 0 ? <p className={styles.muted}>No chapters yet.</p> : null}
      <ul className={styles.list} aria-label="Chapters">
        {shown.map((chapter) => (
          <li key={chapter.id} className={styles.chapterRow} data-chapter-id={chapter.id}>
            <button type="button" className={styles.chapterName} onClick={() => open(chapter.id)}>
              {chapter.title}
            </button>
            {chapter.exams.length === 0 ? null : (
              <ul className={styles.chips} aria-label={`Exam versions that cover ${chapter.title}`}>
                {chapter.exams.map((chip) => (
                  <li key={chip.examVersionId} className={`${styles.chip} ${chip.coverage === 'partial' ? styles.partialChip : ''}`}>
                    {chipWords(chip)}
                  </li>
                ))}
              </ul>
            )}
            <p className={styles.muted}>{countsWords(chapter.counts)}</p>
          </li>
        ))}
        {list.noChapter.total === 0 ? null : (
          <li className={styles.chapterRow} data-chapter-id={NO_CHAPTER}>
            <button type="button" className={styles.chapterName} onClick={() => open(NO_CHAPTER)}>
              {NO_CHAPTER_TITLE}
            </button>
            <p className={styles.muted}>{countsWords(list.noChapter.counts)}</p>
          </li>
        )}
      </ul>
      {list.chapters.length > shown.length ? <p className={styles.notice} role="status">{`Showing ${shown.length} of ${list.chapters.length} chapters.`}</p> : null}
    </>
  );
}
