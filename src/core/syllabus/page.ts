/**
 * The Syllabus page of one exam version (7.6 C): its units in their stored order; per unit the topics it covers as a TREE in topic tree order
 * (a topic nests under its nearest covered ancestor of the same unit), each with its level, the counts of the records at the topic and below
 * (the Chapters rule, `topic-records.ts`) and `gap` = covered with no record. Excluded rows are listed apart. Pure and derived.
 */
import { buildChapterIndex } from '../chapters';
import type { CanonicalState, ExamVersion, Topic } from '../schema';
import { coverageOfVersion, coveredIn, positionsOf } from './coverage';
import { MAX_DEPTH, topicRecords } from './topic-records';
import type { CoveredLevel, ExcludedTopic, SyllabusPage, SyllabusTotals, TopicNode, UnitView } from './types';

export function syllabusPage(state: CanonicalState, versionId: string): SyllabusPage | undefined {
  const version: ExamVersion | undefined = state.records.exam_version[versionId];
  if (version === undefined) return undefined;
  const coverage = coverageOfVersion(version);
  const position = positionsOf(state);
  const records = topicRecords(state, coveredIn(state, version));
  const chapters = buildChapterIndex(state);
  const topicOf = (id: string): Topic | undefined => state.records.topic[id];
  const nameOf = (id: string): string => topicOf(id)?.name ?? id;
  const byPosition = (a: string, b: string): number => position(a) - position(b) || (a < b ? -1 : a > b ? 1 : 0);

  const nearestCovered = (id: string, inUnit: ReadonlySet<string>): string | undefined => {
    let at = topicOf(id)?.parentId as string | undefined;
    for (let depth = 0; at !== undefined && depth < MAX_DEPTH; depth += 1) {
      if (inUnit.has(at)) return at;
      at = topicOf(at)?.parentId as string | undefined;
    }
    return undefined;
  };

  const units: UnitView[] = version.units.map((unit) => {
    const rows = new Map<string, { level: CoveredLevel; note?: string }>();
    for (const row of unit.topicCoverage) {
      if (row.coverage === 'excluded' || rows.has(row.topicId)) continue;
      const level = coverage.covered.get(row.topicId) as CoveredLevel;
      rows.set(row.topicId, { level, ...(row.coverage === level && row.note !== undefined ? { note: row.note } : {}) });
    }
    const inUnit = new Set(rows.keys());
    const children = new Map<string | undefined, string[]>();
    for (const id of [...inUnit].sort(byPosition)) {
      const parent = nearestCovered(id, inUnit);
      children.set(parent, [...(children.get(parent) ?? []), id]);
    }
    const build = (id: string, depth: number): TopicNode => {
      const row = rows.get(id) as { level: CoveredLevel; note?: string };
      const { counts, total } = records.countsAt(id);
      return {
        topicId: id,
        name: nameOf(id),
        topicKind: topicOf(id)?.topicKind ?? 'topic',
        chapterId: chapters.chapterOfTopic(id),
        coverage: row.level,
        ...(row.note === undefined ? {} : { note: row.note }),
        counts,
        total,
        gap: total === 0,
        children: depth >= MAX_DEPTH ? [] : (children.get(id) ?? []).map((child) => build(child, depth + 1)),
      };
    };
    const excluded: ExcludedTopic[] = [...new Set(unit.topicCoverage.filter((row) => row.coverage === 'excluded' && coverage.excluded.has(row.topicId)).map((row) => row.topicId as string))]
      .sort(byPosition)
      .map((id) => ({ topicId: id, name: nameOf(id) }));
    return {
      id: unit.id,
      ...(unit.code === undefined ? {} : { code: unit.code }),
      title: unit.title,
      ...(unit.officialText === undefined ? {} : { officialText: unit.officialText }),
      roots: (children.get(undefined) ?? []).map((id) => build(id, 0)),
      excluded,
    };
  });

  const coveredIds = [...coverage.covered.keys()];
  let withContent = 0;
  for (const id of coveredIds) if (records.countsAt(id).total > 0) withContent += 1;
  const totals: SyllabusTotals = { topics: coveredIds.length, withContent, gaps: coveredIds.length - withContent, records: records.distinctIn(coveredIds) };
  return {
    versionId: version.id,
    examId: version.examId,
    label: version.label,
    status: version.status,
    ...(version.year === undefined ? {} : { year: version.year }),
    ...(version.effectiveFrom === undefined ? {} : { effectiveFrom: version.effectiveFrom }),
    ...(version.effectiveTo === undefined ? {} : { effectiveTo: version.effectiveTo }),
    units,
    totals,
  };
}

export const syllabusTotals = (page: SyllabusPage): SyllabusTotals => page.totals;
