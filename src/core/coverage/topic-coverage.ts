/**
 * The ONE coverage rule (7.7 A, ADR-042 addendum). What an exam version says about a topic:
 *  a) the NEAREST topic (itself first, then its ancestors) that has any coverage entry in that version decides, so an explicit `excluded`
 *     on a subtopic beats an `included` chapter above it;
 *  b) when that topic has several entries (two units), the strongest wins: included > partial > excluded;
 *  c) no entry on the topic or any ancestor = not covered (`undefined`).
 * The derived scope, the Chapters list and the Syllabus all call this; ExamRelevance overrides still win over it, as before. Pure, bounded.
 */
import type { CoverageLevel } from '../schema';

export const MAX_COVERAGE_DEPTH = 32;
const STRENGTH: Readonly<Record<CoverageLevel, number>> = { included: 0, partial: 1, excluded: 2 };

interface VersionLike {
  readonly units: readonly { readonly topicCoverage: readonly { readonly topicId: string; readonly coverage: CoverageLevel }[] }[];
}

/** The strongest entry per topic across all units of the version (rule b). */
export function strongestCoverage(version: VersionLike): Map<string, CoverageLevel> {
  const out = new Map<string, CoverageLevel>();
  for (const unit of version.units) {
    for (const row of unit.topicCoverage) {
      const before = out.get(row.topicId);
      if (before === undefined || STRENGTH[row.coverage] < STRENGTH[before]) out.set(row.topicId, row.coverage);
    }
  }
  return out;
}

/** Rules a and c: the level of the nearest topic at or above `topicId` that the map lists, or `undefined`. */
export function coverageOfTopic(strongest: ReadonlyMap<string, CoverageLevel>, topicId: string, parentOf: (id: string) => string | undefined): CoverageLevel | undefined {
  let at: string | undefined = topicId;
  for (let depth = 0; at !== undefined && depth < MAX_COVERAGE_DEPTH; depth += 1) {
    const level = strongest.get(at);
    if (level !== undefined) return level;
    at = parentOf(at);
  }
  return undefined;
}
