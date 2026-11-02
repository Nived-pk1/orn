/**
 * One row of a unit's topic tree (7.6 D): the topic's name, a chip only when the coverage is PARTIAL (the unit's note on hover, written under
 * the row on a phone), the counts of the records at the topic and below in words (the Chapters wording), and a link to its chapter. A gap row
 * (covered, no record) is muted: Study shows a dash in place of the counts, Studio says "Nothing here yet".
 */
import { countWords } from '@/core/chapters';
import type { TopicNode } from '@/core/syllabus';
import styles from './syllabus-view.module.css';

/** "Open chapter" for a chapter topic; "In <chapter>" (the chapter it is in) for a lower topic. Nothing when the topic has no chapter. */
export function ChapterLink(props: { readonly chapterId: string | undefined; readonly isChapter: boolean; readonly chapterName: (id: string) => string; readonly open: (id: string) => void }) {
  const { chapterId } = props;
  if (chapterId === undefined) return null;
  const name = props.chapterName(chapterId);
  return (
    <button type="button" className={styles.link} aria-label={`Open chapter ${name}`} onClick={() => props.open(chapterId)}>
      {props.isChapter ? 'Open chapter' : `In ${name}`}
    </button>
  );
}

interface FactsProps {
  readonly node: TopicNode;
  readonly editing: boolean;
  readonly chapterName: (id: string) => string;
  readonly openChapter: (id: string) => void;
}

/** The chip, the counts and the link of a topic (a row, or the heading line of a unit that is that one topic). Study leaves the link off a gap (it leads to an empty page). */
export function TopicFacts(props: FactsProps) {
  const { node, editing } = props;
  const partial = node.coverage === 'partial';
  return (
    <>
      {partial ? (
        <span className={styles.chip} {...(node.note === undefined ? {} : { title: node.note })}>
          partly
        </span>
      ) : null}
      <span className={styles.counts}>{node.gap ? (editing ? 'Nothing here yet' : '—') : countWords(node.counts)}</span>
      {node.gap && !editing ? null : <ChapterLink chapterId={node.chapterId} isChapter={node.chapterId === node.topicId} chapterName={props.chapterName} open={props.openChapter} />}
    </>
  );
}

export function TopicRow(props: FactsProps & { readonly depth: number; readonly phone: boolean }) {
  const { node, depth, phone } = props;
  return (
    <li className={`${styles.row} ${node.gap ? styles.gapRow : ''}`} data-topic-id={node.topicId} {...(node.gap ? { 'data-gap': '' } : {})} style={depth === 0 ? undefined : { paddingLeft: `${depth * 1.25}rem` }}>
      <span className={styles.rowName}>{node.name}</span>
      <TopicFacts node={node} editing={props.editing} chapterName={props.chapterName} openChapter={props.openChapter} />
      {phone && node.coverage === 'partial' && node.note !== undefined ? <p className={styles.noteLine}>{node.note}</p> : null}
    </li>
  );
}
