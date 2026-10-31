/**
 * The chapter list (7.3b C1): every chapter with the number of its records per kind (core and the others apart), the exam versions that
 * cover it, and "No chapter yet" for the records mapped nowhere. With an exam scope only the chapters that version covers are listed,
 * in the order of its units, the partial ones marked. Reactions are counted as CARDS (examples fold under their general reaction, as in
 * every other list since 7.3a).
 */
import { foldExamples } from '../graph/family/examples';
import type { CanonicalState, RecordRef } from '../schema';
import type { ChapterIndex, ChapterSummary, ChaptersList, CoverageWord, ExamChip, GroupKey, KindCounts, MappingRole } from './types';
import { CHAPTER_GROUPS } from './types';

export interface ChaptersOptions {
  /** Only the chapters this exam version covers, in its units' order. */
  readonly examVersionId?: string;
}

const GROUP_OF = new Map(CHAPTER_GROUPS.flatMap((group) => group.kinds.map((kind) => [kind, group.key] as const)));
const RANK: Readonly<Record<CoverageWord, number>> = { included: 0, partial: 1 };

const emptyCounts = (): Record<GroupKey, { core: number; other: number }> =>
  Object.fromEntries(CHAPTER_GROUPS.map((group) => [group.key, { core: 0, other: 0 }])) as Record<GroupKey, { core: number; other: number }>;

/** Every study record with the roles it has per chapter (`none` when it is mapped nowhere). */
export function studyRecords(state: CanonicalState): readonly RecordRef[] {
  const out: RecordRef[] = [];
  for (const group of CHAPTER_GROUPS) for (const kind of group.kinds) for (const id of Object.keys(state.records[kind] as Record<string, unknown>)) out.push({ kind, id } as RecordRef);
  return out;
}

/** The coverage each exam version gives each chapter: the best of its units' entries; `order` is where the version first mentions it. */
function coverageOf(state: CanonicalState, index: ChapterIndex): Map<string, Map<string, { coverage: CoverageWord; order: number }>> {
  const out = new Map<string, Map<string, { coverage: CoverageWord; order: number }>>();
  for (const version of Object.values(state.records.exam_version)) {
    const per = new Map<string, { coverage: CoverageWord; order: number }>();
    let order = 0;
    for (const unit of version.units) {
      for (const entry of unit.topicCoverage) {
        order += 1;
        if (entry.coverage === 'excluded') continue;
        const chapterId = index.chapterOfTopic(entry.topicId);
        if (chapterId === undefined) continue;
        const coverage: CoverageWord = entry.coverage === 'partial' ? 'partial' : 'included';
        const before = per.get(chapterId);
        per.set(chapterId, { coverage: before === undefined || RANK[coverage] < RANK[before.coverage] ? coverage : before.coverage, order: before?.order ?? order });
      }
    }
    out.set(version.id, per);
  }
  return out;
}

export function chaptersOf(state: CanonicalState, index: ChapterIndex, options: ChaptersOptions = {}): ChaptersList {
  const counts = new Map<string, Record<GroupKey, { core: number; other: number }>>(index.chapters.map((chapter) => [chapter.id, emptyCounts()]));
  const totals = new Map<string, number>();
  const none = emptyCounts();
  let noneTotal = 0;
  const reactionsIn = new Map<string, { id: string; role: MappingRole }[]>();
  const addReaction = (chapterId: string, entry: { id: string; role: MappingRole }): void => {
    const list = reactionsIn.get(chapterId);
    if (list === undefined) reactionsIn.set(chapterId, [entry]);
    else list.push(entry);
  };

  for (const ref of studyRecords(state)) {
    const key = GROUP_OF.get(ref.kind) as GroupKey;
    const memberships = index.membershipsOf(ref);
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
    exams: chipsOf(chapter.id),
    ...(scoped?.get(chapter.id) === undefined ? {} : { scopeCoverage: scoped.get(chapter.id)?.coverage as CoverageWord }),
  }));
  let hiddenByExam = 0;
  if (options.examVersionId !== undefined) {
    const kept = chapters.filter((chapter) => scoped?.has(chapter.id) === true);
    hiddenByExam = chapters.length - kept.length;
    chapters = kept.sort((a, b) => (scoped?.get(a.id)?.order ?? 0) - (scoped?.get(b.id)?.order ?? 0));
  }
  return { chapters, noChapter: { counts: none, total: noneTotal }, hiddenByExam };
}
