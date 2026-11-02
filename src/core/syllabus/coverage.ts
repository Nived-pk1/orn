/**
 * What an exam version says about each LISTED topic (7.6 C, 7.7 A): the strongest entry across all units (the ONE rule, `coverage/`); `excluded`
 * means every entry is excluded. Also the topic tree order.
 */
import { treeOrder } from '../chapters';
import { coverageOfTopic, strongestCoverage } from '../coverage';
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
  const excluded = new Set<string>();
  for (const [topicId, level] of strongestCoverage(version)) {
    if (level === 'excluded') excluded.add(topicId);
    else covered.set(topicId, level);
  }
  return { covered, excluded };
}

/** The position of every topic in the tree order (sibling `order`, depth first); a topic that is not in the data goes last. */
export function positionsOf(state: CanonicalState): (topicId: string) => number {
  const position = treeOrder(Object.values(state.records.topic));
  return (topicId) => position.get(topicId) ?? Number.MAX_SAFE_INTEGER;
}

/** True for a topic the version covers by the ONE rule (included or partial, the nearest listed topic deciding). */
export function coveredIn(state: CanonicalState, version: ExamVersion): (topicId: string) => boolean {
  const strongest = strongestCoverage(version);
  const parentOf = (id: string): string | undefined => state.records.topic[id]?.parentId;
  return (topicId) => {
    const level = coverageOfTopic(strongest, topicId, parentOf);
    return level === 'included' || level === 'partial';
  };
}
