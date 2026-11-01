/**
 * What changed between two versions of ONE exam (7.6 C): per TOPIC (never per unit), covered in A and not in B ("new in A"), covered in B and
 * not in A ("not in A any more"), or covered in both at another level ("changed"). An excluded or absent topic is "not covered". Each row
 * carries the records at the topic and below, so the reader sees what the change affects. Sorted by topic order. Pure and derived.
 */
import { buildChapterIndex } from '../chapters';
import type { CanonicalState } from '../schema';
import { coverageOfVersion, positionsOf } from './coverage';
import { topicRecords } from './topic-records';
import type { ChangedRow, DiffRow, SyllabusDiff } from './types';

export function syllabusDiff(state: CanonicalState, versionA: string, versionB: string): SyllabusDiff {
  const a = state.records.exam_version[versionA];
  const b = state.records.exam_version[versionB];
  if (a === undefined || b === undefined) return { ok: false, reason: 'unknown_version' };
  if (a.examId !== b.examId) return { ok: false, reason: 'different_exams' };
  const inA = coverageOfVersion(a).covered;
  const inB = coverageOfVersion(b).covered;
  const position = positionsOf(state);
  const records = topicRecords(state);
  const chapters = buildChapterIndex(state);
  const row = (id: string): DiffRow => ({ topicId: id, name: state.records.topic[id]?.name ?? id, chapterId: chapters.chapterOfTopic(id), records: records.countsAt(id).total });
  const inOrder = (ids: readonly string[]): string[] => [...ids].sort((x, y) => position(x) - position(y) || (x < y ? -1 : x > y ? 1 : 0));

  const added = inOrder([...inA.keys()].filter((id) => !inB.has(id))).map(row);
  const removed = inOrder([...inB.keys()].filter((id) => !inA.has(id))).map(row);
  const changed: ChangedRow[] = inOrder([...inA.keys()].filter((id) => inB.has(id) && inA.get(id) !== inB.get(id))).map((id) => ({
    ...row(id),
    from: inB.get(id) as ChangedRow['from'],
    to: inA.get(id) as ChangedRow['to'],
  }));
  return { ok: true, added, removed, changed, empty: added.length + removed.length + changed.length === 0 };
}
