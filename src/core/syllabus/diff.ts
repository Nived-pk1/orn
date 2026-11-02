/**
 * What changed between two versions of ONE exam (7.6 C): per TOPIC (never per unit), covered in A and not in B ("new in A"), covered in B and
 * not in A ("not in A any more"), or covered in both at another level ("changed"). An excluded or absent topic is "not covered". Each row
 * carries the records at the topic and below, so the reader sees what the change affects. Sorted by topic order. Pure and derived.
 */
import { buildChapterIndex } from '../chapters';
import type { CanonicalState, CoverageLevel } from '../schema';
import { coverageOfTopic, strongestCoverage } from '../coverage';
import { coveredIn, positionsOf } from './coverage';
import { topicRecords } from './topic-records';
import type { ChangedRow, CoveredLevel, DiffRow, SyllabusDiff } from './types';

export function syllabusDiff(state: CanonicalState, versionA: string, versionB: string): SyllabusDiff {
  const a = state.records.exam_version[versionA];
  const b = state.records.exam_version[versionB];
  if (a === undefined || b === undefined) return { ok: false, reason: 'unknown_version' };
  if (a.examId !== b.examId) return { ok: false, reason: 'different_exams' };
  const strongA = strongestCoverage(a);
  const strongB = strongestCoverage(b);
  const parentOf = (id: string): string | undefined => state.records.topic[id]?.parentId;
  /** The level the ONE rule gives the topic in a version; `undefined` when it is excluded or not covered. */
  const levelIn = (strong: ReadonlyMap<string, CoverageLevel>, id: string): CoveredLevel | undefined => {
    const level = coverageOfTopic(strong, id, parentOf);
    return level === 'excluded' ? undefined : level;
  };
  const listed = [...new Set([...strongA.keys(), ...strongB.keys()])];
  const levelA = new Map(listed.map((id) => [id, levelIn(strongA, id)] as const));
  const levelB = new Map(listed.map((id) => [id, levelIn(strongB, id)] as const));
  const position = positionsOf(state);
  const recordsA = topicRecords(state, coveredIn(state, a));
  const recordsB = topicRecords(state, coveredIn(state, b));
  const chapters = buildChapterIndex(state);
  /** The records are counted in the version that covers the topic (A, except for a topic only B covers). */
  const row = (id: string, inVersion: typeof recordsA): DiffRow => ({ topicId: id, name: state.records.topic[id]?.name ?? id, chapterId: chapters.chapterOfTopic(id), records: inVersion.countsAt(id).total, counts: inVersion.countsAt(id).counts });
  const inOrder = (ids: readonly string[]): string[] => [...ids].sort((x, y) => position(x) - position(y) || (x < y ? -1 : x > y ? 1 : 0));

  const added = inOrder(listed.filter((id) => levelA.get(id) !== undefined && levelB.get(id) === undefined)).map((id) => row(id, recordsA));
  const removed = inOrder(listed.filter((id) => levelB.get(id) !== undefined && levelA.get(id) === undefined)).map((id) => row(id, recordsB));
  const changed: ChangedRow[] = inOrder(listed.filter((id) => levelA.get(id) !== undefined && levelB.get(id) !== undefined && levelA.get(id) !== levelB.get(id))).map((id) => ({
    ...row(id, recordsA),
    from: levelB.get(id) as CoveredLevel,
    to: levelA.get(id) as CoveredLevel,
  }));
  return { ok: true, added, removed, changed, empty: added.length + removed.length + changed.length === 0 };
}
