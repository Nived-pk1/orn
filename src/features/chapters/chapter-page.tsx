/**
 * One chapter's page (step 7.3b D3): its title and the exam versions that cover it, a filter bar (kind chips with counts, "Find in this
 * chapter", "Only <exam version>"), then the groups in the study order, each a heading with its count, "Also used here" and "Extra" as
 * sub-headings, 30 cards at a time. Reactions are the family card (examples folded). On a phone the filters sit behind "Filters (n)".
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { chapterContents, chaptersOf, NO_CHAPTER, NO_CHAPTER_TITLE, type ChapterGroup, type ChapterIndex, type ExamChip } from '@/core/chapters';
import { createScopeOf } from '@/core/graph';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, RecordRef } from '@/core/schema';
import { Button, Dialog } from '@/ui/primitives';
import { currentOf, type ActiveExam } from '@/ui/state';
import type { ChaptersPorts } from './contracts';
import { filterContents, kindWord, PAGE_SIZE } from './model';
import { StudyCard } from './study-cards';
import styles from './chapters-view.module.css';

export const chipWords = (chip: ExamChip): string => `${chip.versionLabel}${chip.coverage === 'partial' ? ' (partial)' : ''}`;

function GroupView(props: { readonly group: ChapterGroup; readonly ports: ChaptersPorts; readonly state: CanonicalState; readonly selected: string | null; readonly outsideOf: (ref: RecordRef) => string | undefined }) {
  const { group, ports, state } = props;
  const [limit, setLimit] = useState(PAGE_SIZE);
  const total = group.count;
  let room = limit;
  const cardOf = (ref: RecordRef) => {
    const outside = props.outsideOf(ref);
    if (ref.kind === 'reaction') {
      const examples = group.examplesOf?.get(ref.id) ?? [];
      return (
        <li key={ref.id} className={styles.cardItem}>
          {ports.renderCard({
            reactionId: ref.id,
            selected: props.selected === ref.id,
            onSelect: ports.selectReaction,
            ...(outside === undefined ? {} : { outside }),
            ...(examples.length === 0 ? {} : { examples, selectedId: props.selected, outsideOf: (id: string) => props.outsideOf({ kind: 'reaction', id } as RecordRef) }),
            fallback: (reason) => <p className={styles.muted}>{`${ports.nameOf(ref)}: ${reason}`}</p>,
          })}
        </li>
      );
    }
    return <StudyCard key={ref.id} refOf={ref} ports={ports} state={state} selected={props.selected === ref.id} outside={outside} />;
  };
  return (
    <section className={styles.group} aria-label={group.title} data-group={group.key}>
      <h3 className={styles.groupHeading}>{`${group.title} (${total})`}</h3>
      {group.parts.map((part) => {
        const shown = part.refs.slice(0, Math.max(0, room));
        room -= shown.length;
        if (shown.length === 0) return null;
        return (
          <div key={part.part}>
            {part.title === undefined ? null : <h4 className={styles.partHeading}>{part.title}</h4>}
            <ul className={styles.list}>{shown.map(cardOf)}</ul>
          </div>
        );
      })}
      {total > limit ? (
        <div className={styles.more}>
          <p className={styles.muted}>{`Showing ${Math.min(limit, total)} of ${total} ${kindWord(group.key, total)}`}</p>
          <button type="button" onClick={() => setLimit((n) => n + PAGE_SIZE)}>{`Show ${PAGE_SIZE} more`}</button>
        </div>
      ) : null}
    </section>
  );
}

export function ChapterPage(props: {
  readonly ports: ChaptersPorts;
  readonly state: CanonicalState;
  readonly indexes: ReadonlyIndexes;
  readonly chapters: ChapterIndex;
  readonly chapterId: string;
  readonly active: ActiveExam | null;
  readonly phone: boolean;
}) {
  const { ports, state, indexes, chapterId, active, phone } = props;
  const kinds = useStore(ports.ui.chapters, (s) => s.kinds);
  const text = useStore(ports.ui.chapters, (s) => s.text);
  const onlyInScope = useStore(ports.ui.chapters, (s) => s.onlyInScope);
  const inspector = useStore(ports.ui.inspector, (s) => currentOf(s));
  const [sheet, setSheet] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [chapterId]);
  const set = ports.ui.chapters.getState();
  const title = chapterId === NO_CHAPTER ? NO_CHAPTER_TITLE : (props.chapters.chapters.find((c) => c.id === chapterId)?.title ?? chapterId);
  const chips = useMemo(() => (chapterId === NO_CHAPTER ? [] : (chaptersOf(state, props.chapters).chapters.find((c) => c.id === chapterId)?.exams ?? [])), [state, props.chapters, chapterId]);
  const contents = useMemo(() => chapterContents(state, props.chapters, chapterId, { nameOf: ports.nameOf }), [state, props.chapters, chapterId, ports]);
  const scopeOf = useMemo(() => (active === null ? undefined : createScopeOf(indexes, active.examId, active.examVersionId)), [indexes, active]);
  const examName = active === null ? undefined : (state.records.exam[active.examId]?.name ?? active.examId);
  const versionName = active === null ? undefined : (state.records.exam_version[active.examVersionId]?.label ?? active.examVersionId);
  const isOutside = (ref: RecordRef): boolean => scopeOf?.(ref) === 'outside';
  const outsideOf = (ref: RecordRef): string | undefined => (examName !== undefined && isOutside(ref) ? `outside ${examName}` : undefined);
  const filtered = useMemo(
    () => filterContents(contents, { kinds, text, onlyInScope }, ports.nameOf, scopeOf === undefined ? undefined : (ref) => scopeOf(ref) === 'outside'),
    [contents, kinds, text, onlyInScope, scopeOf, ports],
  );
  const countOf = (key: ChapterGroup['key']): number => contents.groups.find((g) => g.key === key)?.count ?? 0;
  const chosen = kinds.length + (text.trim() === '' ? 0 : 1) + (onlyInScope ? 1 : 0);
  const controls = (
    <>
      <div className={styles.bar} role="group" aria-label="Kinds">
        {contents.groups.map((group) => (
          <button key={group.key} type="button" className={`${styles.chip} ${styles.kindChip}`} aria-pressed={kinds.includes(group.key)} onClick={() => set.toggleKind(group.key)}>
            {`${group.title} ${countOf(group.key)}`}
          </button>
        ))}
      </div>
      <label className={styles.field}>
        <span>Find in this chapter</span>
        <input type="search" value={text} autoComplete="off" spellCheck={false} onChange={(event) => set.setText(event.target.value)} />
      </label>
      {versionName === undefined ? null : (
        <label className={styles.option}>
          <input type="checkbox" checked={onlyInScope} onChange={(event) => set.setOnlyInScope(event.target.checked)} />
          <span>{`Only ${versionName}`}</span>
        </label>
      )}
      {chosen === 0 ? null : (
        <button type="button" onClick={() => set.clearFilters()}>
          Clear filters
        </button>
      )}
    </>
  );
  const shownCount = filtered.groups.reduce((n, g) => n + g.count, 0);
  return (
    <>
      <header className={styles.header}>
        <button type="button" onClick={() => set.back()}>
          All chapters
        </button>
        <h2 ref={heading} tabIndex={-1} className={styles.title}>
          {title}
        </h2>
      </header>
      {chips.length === 0 ? null : (
        <ul className={styles.chips} aria-label="Exam versions that cover this chapter">
          {chips.map((chip) => (
            <li key={chip.examVersionId} className={`${styles.chip} ${chip.coverage === 'partial' ? styles.partialChip : ''}`}>
              {chipWords(chip)}
            </li>
          ))}
        </ul>
      )}
      {contents.groups.length === 0 ? (
        <p className={styles.muted}>Nothing is mapped to this chapter yet.</p>
      ) : (
        <>
          {phone ? (
            <button type="button" aria-haspopup="dialog" onClick={() => setSheet(true)}>{`Filters (${chosen})`}</button>
          ) : (
            <div className={styles.bar} role="group" aria-label="Filters">
              {controls}
            </div>
          )}
          {phone && sheet ? (
            <Dialog open onClose={() => setSheet(false)} title="Filters" size="screen" footer={<Button variant="primary" onClick={() => setSheet(false)}>{`Show ${shownCount} ${shownCount === 1 ? 'record' : 'records'}`}</Button>}>
              <div className={styles.sheet}>{controls}</div>
            </Dialog>
          ) : null}
          {filtered.hidden > 0 ? <p className={styles.muted}>{`${filtered.hidden} ${filtered.hidden === 1 ? 'record is' : 'records are'} left out by the filters.`}</p> : null}
          {filtered.groups.length === 0 ? <p className={styles.muted}>No record matches these filters.</p> : null}
          {filtered.groups.map((group) => (
            <GroupView key={group.key} group={group} ports={ports} state={state} selected={inspector === null ? null : inspector.id} outsideOf={outsideOf} />
          ))}
        </>
      )}
    </>
  );
}
