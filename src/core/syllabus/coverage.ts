/**
 * What an exam version says about each topic (7.6 C), by the Chapters list's rule (`chapters/list.ts` coverageOf): across ALL the units of
 * the version the STRONGER of included and partial wins; an `excluded` row counts only for a topic no unit covers. Also the topic tree order.
 */
import { treeOrder } from '../chapters';
import type { CanonicalState, ExamVersion } from '../schema';
import type { CoveredLevel } from './types';

export interface VersionCoverage {
  /** Effective level of every topic some row covers (included or partial). */
  readonly covered: ReadonlyMap<string, CoveredLevel>;
  /** Topics only excluded (no unit covers them). */
  readonly excluded: ReadonlySet<string>;
}

export function coverageOfVersion(version: ExamVersion): VersionCoverage {
  const covered = new Map<string, CoveredLevel>();
  const listedExcluded = new Set<string>();
  for (const unit of version.units) {
    for (const row of unit.topicCoverage) {
      if (row.coverage === 'excluded') {
        listedExcluded.add(row.topicId);
        continue;
      }
      if (covered.get(row.topicId) !== 'included') covered.set(row.topicId, row.coverage);
    }
  }
  return { covered, excluded: new Set([...listedExcluded].filter((id) => !covered.has(id))) };
}

/** The position of every topic in the tree order (sibling `order`, depth first); a topic that is not in the data goes last. */
export function positionsOf(state: CanonicalState): (topicId: string) => number {
  const position = treeOrder(Object.values(state.records.topic));
  return (topicId) => position.get(topicId) ?? Number.MAX_SAFE_INTEGER;
}
