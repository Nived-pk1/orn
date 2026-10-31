/**
 * "In chapters: <links>" (step 7.3b D4): under the title of any study record, the chapters it is in (derived from the topic mappings by the
 * core, never stored). A link opens that chapter's page; a record in no chapter says so. Records that are not study records (topics,
 * mappings, exams, ...) have no such line.
 */
import { useMemo } from 'react';
import { buildChapterIndex, NO_CHAPTER_TITLE } from '@/core/chapters';
import type { RecordRef } from '@/core/schema';
import { useLayoutMode } from '@/ui/hooks';
import { useInspectorEnv } from './env';
import styles from './inspector.module.css';

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
  return (
    <p className={styles.status} data-in-chapters="">
      {'In chapters: '}
      {found.length === 0
        ? NO_CHAPTER_TITLE
        : found.map((chapter, i) => (
            <span key={chapter.id}>
              {i > 0 ? ', ' : null}
              {host.openChapter === undefined ? (
                chapter.title
              ) : (
                <button type="button" className={styles.linkButton} onClick={() => {
                    host.openChapter?.(chapter.id);
                    if (phone) host.closePane?.();
                  }}>
                  {chapter.title}
                </button>
              )}
            </span>
          ))}
    </p>
  );
}
