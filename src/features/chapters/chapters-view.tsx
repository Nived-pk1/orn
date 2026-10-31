/**
 * The Chapters view (step 7.3b D1-D6): the list of chapters, and one chapter's page with study cards. The chapters, their counts and their
 * contents are the core's (`@/core/chapters`, derived from the topics and the topic mappings, never stored); this file draws and edits UI
 * state (the open chapter and the filters; saved, never records). A saved chapter that no longer exists is dropped, and said once.
 * No chemistry here.
 */
import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { buildChapterIndex, chaptersOf, NO_CHAPTER } from '@/core/chapters';
import { useLayoutMode } from '@/ui/hooks';
import type { ChaptersPorts } from './contracts';
import { ChapterList } from './chapter-list';
import { ChapterPage } from './chapter-page';
import styles from './chapters-view.module.css';

const GONE_WORDS = 'The chapter you had open is no longer in the data; the list is shown.';

export function ChaptersView(props: { readonly ports: ChaptersPorts }) {
  const { ports } = props;
  const chapterId = useStore(ports.ui.chapters, (s) => s.chapterId);
  const active = useStore(ports.ui.exam, (s) => s.active);
  const phone = useLayoutMode() === 'phone';
  const [version, setVersion] = useState(0);
  const [gone, setGone] = useState(false);
  useEffect(() => ports.store.subscribe(() => setVersion((v) => v + 1)), [ports]);

  // `version` makes a new snapshot when the data moved (the store and the indexes are read, not props)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const source = useMemo(() => ({ state: ports.store.getState(), indexes: ports.indexes.current() }), [ports, version]);
  const { state, indexes } = source;
  const chapters = useMemo(() => buildChapterIndex(state), [state]);
  const list = useMemo(() => chaptersOf(state, chapters, active === null ? {} : { examVersionId: active.examVersionId }), [state, chapters, active]);

  const unknown = chapterId !== null && chapterId !== NO_CHAPTER && !chapters.chapters.some((chapter) => chapter.id === chapterId);
  useEffect(() => {
    if (!unknown) return;
    ports.ui.chapters.getState().back();
    setGone(true);
    ports.log('chapters_chapter_pruned', 'a saved chapter named a topic that is no longer a chapter; the list is shown');
  }, [unknown, ports]);

  const examName = active === null ? undefined : (state.records.exam_version[active.examVersionId]?.label ?? state.records.exam[active.examId]?.name ?? active.examId);
  const line = chapterId === null || unknown ? `${list.chapters.length} ${list.chapters.length === 1 ? 'chapter' : 'chapters'}` : '';
  return (
    <section className={styles.view} aria-label="Chapters" data-chapters-view="" data-layout={phone ? 'phone' : 'desktop'}>
      {chapterId === null || unknown ? (
        <>
          <header className={styles.header}>
            <h2 className={styles.title}>Chapters</h2>
            <p className={styles.muted}>{line}</p>
          </header>
          {gone ? <p className={styles.notice} role="status">{GONE_WORDS}</p> : null}
          <ChapterList ports={ports} list={list} examName={examName} />
        </>
      ) : (
        <ChapterPage ports={ports} state={state} indexes={indexes} chapters={chapters} chapterId={chapterId} active={active} phone={phone} />
      )}
    </section>
  );
}
