/**
 * "In the syllabus" with the chapters as chips (step 7.3b D4, restyled in 8.1): under the title of any study record, the chapters it is in (derived from the topic mappings by the
 * core, never stored). A link opens that chapter's page; a record in no chapter says so. Records that are not study records (topics,
 * mappings, exams, ...) have no such line. On a phone the line is in the FULL part of the sheet (`data-sheet-full`), so the peek keeps its height.
 */
import { useMemo } from 'react';
import { buildChapterIndex, NO_CHAPTER_TITLE } from '@/core/chapters';
import type { RecordRef } from '@/core/schema';
import { useLayoutMode } from '@/ui/hooks';
import { useInspectorEnv } from './env';
import styles from './inspector.module.css';
import study from './study-inspector.module.css';

const STUDY_KINDS: ReadonlySet<string> = new Set(['concept', 'reaction', 'named_reaction', 'mechanism', 'caveat', 'species', 'class', 'reagent', 'route', 'transformation']);

export function InChapters(props: { readonly refOf: RecordRef }) {
  const { state, host } = useInspectorEnv();
  const phone = useLayoutMode() === 'phone';
  const found = useMemo(() => {
    if (!STUDY_KINDS.has(props.refOf.kind)) return undefined;
    const index = buildChapterIndex(state);
    const titles = new Map(index.chapters.map((chapter) => [chapter.id, chapter.title] as const));
    return index.membershipsOf(props.refOf).map((membership) => ({ id: membership.chapterId, title: titles.get(membership.chapterId) ?? membership.chapterId }));
  }, [state, props.refOf]);
  if (found === undefined) return null;
  // Study (no editor wired) leaves the line out when the record is in no chapter (7.6 A1)
  if (found.length === 0 && host.editNames === undefined) return null;
  return (
    <div className={study.chapters} data-in-chapters="" {...(phone ? { 'data-sheet-full': '' } : {})}>
      <span className={styles.status}>In the syllabus</span>
      {found.length === 0 ? (
        <span className={styles.status}>{NO_CHAPTER_TITLE}</span>
      ) : (
        <ul className={study.chips} aria-label="Chapters of this record">
          {found.map((chapter) => (
            <li key={chapter.id}>
              {host.openChapter === undefined ? (
                <span className={study.chip}>{chapter.title}</span>
              ) : (
                <button
                  type="button"
                  className={`${study.chip} ${study.chipLink}`}
                  onClick={() => {
                    host.openChapter?.(chapter.id);
                    if (phone) host.closePane?.();
                  }}
                >
                  {chapter.title}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
