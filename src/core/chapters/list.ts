/**
 * The chapter list (7.3b C1): every chapter with the number of its records per kind (core and the others apart), the exam versions that
 * cover it, and "No chapter yet" for the records mapped nowhere. With an exam scope only the chapters that version covers are listed,
 * in the order of its units, the partial ones marked. Reactions are counted as CARDS (examples fold under their general reaction, as in
 * every other list since 7.3a).
 */
import { coverageOfTopic, strongestCoverage } from '../coverage';
import { foldExamples } from '../graph/family/examples';
import type { CanonicalState, RecordRef } from '../schema';
import { isUnwrittenConcept } from './written';
import type { ChapterIndex, ChapterSummary, ChaptersList, CoverageWord, ExamChip, GroupKey, KindCounts, MappingRole } from './types';
import { CHAPTER_GROUPS } from './types';

export interface ChaptersOptions {
  /** Only the chapters this exam version covers, in its units' order. */
  readonly examVersionId?: string;
  /** Studio: count the concepts with no text apart (`unwritten`). Study (the default): they are not counted at all. */
  readonly showUnwritten?: boolean;
}

const GROUP_OF = new Map(CHAPTER_GROUPS.flatMap((group) => group.kinds.map((kind) => [kind, group.key] as const)));

const emptyCounts = (): Record<GroupKey, { core: number; other: number }> =>
  Object.fromEntries(CHAPTER_GROUPS.map((group) => [group.key, { core: 0, other: 0 }])) as Record<GroupKey, { core: number; other: number }>;

/** Every study record with the roles it has per chapter (`none` when it is mapped nowhere). */
export function studyRecords(state: CanonicalState): readonly RecordRef[] {
  const out: RecordRef[] = [];
  for (const group of CHAPTER_GROUPS) for (const kind of group.kinds) for (const id of Object.keys(state.records[kind] as Record<string, unknown>)) out.push({ kind, id } as RecordRef);
  return out;
}

/**
 * The coverage each exam version gives each chapter, by the ONE rule (`coverage/`, 7.7 A): the chapter topic's own coverage (the nearest listed
 * topic at or above it; the strongest of its entries). `order` is where the version first mentions a topic of the chapter (a chapter covered
 * only by inheritance goes after those, in tree order).
 */
function coverageOf(state: CanonicalState, index: ChapterIndex): Map<string, Map<string, { coverage: CoverageWord; order: number }>> {
  const out = new Map<string, Map<string, { coverage: CoverageWord; order: number }>>();
  const parentOf = (id: string): string | undefined => state.records.topic[id]?.parentId;
  for (const version of Object.values(state.records.exam_version)) {
    const strongest = strongestCoverage(version);
    const firstMention = new Map<string, number>();
    let order = 0;
    for (const unit of version.units) {
      for (const entry of unit.topicCoverage) {
        order += 1;
        if (entry.coverage === 'excluded') continue;
        const chapterId = index.chapterOfTopic(entry.topicId);
        if (chapterId !== undefined && !firstMention.has(chapterId)) firstMention.set(chapterId, order);
      }
    }
    const per = new Map<string, { coverage: CoverageWord; order: number }>();
    index.chapters.forEach((chapter, at) => {
      const level = coverageOfTopic(strongest, chapter.id, parentOf);
      if (level === undefined || level === 'excluded') return;
      per.set(chapter.id, { coverage: level, order: firstMention.get(chapter.id) ?? order + 1 + at });
    });
    out.set(version.id, per);
  }
  return out;
}

export function chaptersOf(state: CanonicalState, index: ChapterIndex, options: ChaptersOptions = {}): ChaptersList {
  const counts = new Map<string, Record<GroupKey, { core: number; other: number }>>(index.chapters.map((chapter) => [chapter.id, emptyCounts()]));
  const totals = new Map<string, number>();
  const none = emptyCounts();
  let noneTotal = 0;
  let noneUnwritten = 0;
  const unwrittenIn = new Map<string, number>();
  const reactionsIn = new Map<string, { id: string; role: MappingRole }[]>();
  const addReaction = (chapterId: string, entry: { id: string; role: MappingRole }): void => {
    const list = reactionsIn.get(chapterId);
    if (list === undefined) reactionsIn.set(chapterId, [entry]);
    else list.push(entry);
  };

  for (const ref of studyRecords(state)) {
    const key = GROUP_OF.get(ref.kind) as GroupKey;
    const memberships = index.membershipsOf(ref);
    if (isUnwrittenConcept(state, ref)) {
      if (options.showUnwritten === true) {
        if (memberships.length === 0) noneUnwritten += 1;
        for (const membership of memberships) unwrittenIn.set(membership.chapterId, (unwrittenIn.get(membership.chapterId) ?? 0) + 1);
      }
      continue;
    }
    if (memberships.length === 0) {
      if (key === 'reactions') addReaction('', { id: ref.id, role: 'core' });
      else none[key].core += 1;
      noneTotal += 1;
      continue;
    }
    for (const membership of memberships) {
      totals.set(membership.chapterId, (totals.get(membership.chapterId) ?? 0) + 1);
      if (key === 'reactions') addReaction(membership.chapterId, { id: ref.id, role: membership.role });
      else {
        const own = counts.get(membership.chapterId);
        if (own !== undefined) own[key][membership.role === 'core' ? 'core' : 'other'] += 1;
      }
    }
  }

  // reactions as cards: an example folds under its general reaction within one chapter's list
  const lookup = {
    instanceOf: (id: string) => state.records.reaction[id]?.instanceOfId,
    isGeneric: (id: string) => state.records.reaction[id]?.scope === 'generic',
    sortKey: (id: string) => id,
  };
  for (const [chapterId, list] of reactionsIn) {
    const shown = new Set(foldExamples(list.map((entry) => entry.id), lookup).shown);
    const target = chapterId === '' ? none : counts.get(chapterId);
    if (target === undefined) continue;
    for (const entry of list) if (shown.has(entry.id)) target.reactions[entry.role === 'core' ? 'core' : 'other'] += 1;
  }

  const coverage = coverageOf(state, index);
  const examOf = (versionId: string): { name: string; label: string } => {
    const version = state.records.exam_version[versionId];
    const exam = version === undefined ? undefined : state.records.exam[version.examId];
    return { name: exam?.shortName ?? exam?.name ?? version?.label ?? versionId, label: version?.label ?? versionId };
  };
  const chipsOf = (chapterId: string): ExamChip[] => {
    const chips: ExamChip[] = [];
    for (const [versionId, per] of coverage) {
      const one = per.get(chapterId);
      if (one !== undefined) chips.push({ examVersionId: versionId, examName: examOf(versionId).name, versionLabel: examOf(versionId).label, coverage: one.coverage });
    }
    return chips.sort((a, b) => (a.versionLabel < b.versionLabel ? -1 : a.versionLabel > b.versionLabel ? 1 : a.examVersionId < b.examVersionId ? -1 : 1));
  };

  const scoped = options.examVersionId === undefined ? undefined : coverage.get(options.examVersionId);
  let chapters: ChapterSummary[] = index.chapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    order: chapter.order,
    counts: counts.get(chapter.id) as KindCounts,
    total: totals.get(chapter.id) ?? 0,
    unwritten: unwrittenIn.get(chapter.id) ?? 0,
    exams: chipsOf(chapter.id),
    ...(scoped?.get(chapter.id) === undefined ? {} : { scopeCoverage: scoped.get(chapter.id)?.coverage as CoverageWord }),
  }));
  let hiddenByExam = 0;
  if (options.examVersionId !== undefined) {
    const kept = chapters.filter((chapter) => scoped?.has(chapter.id) === true);
    hiddenByExam = chapters.length - kept.length;
    chapters = kept.sort((a, b) => (scoped?.get(a.id)?.order ?? 0) - (scoped?.get(b.id)?.order ?? 0));
  }
  return { chapters, noChapter: { counts: none, total: noneTotal, unwritten: noneUnwritten }, hiddenByExam };
}
