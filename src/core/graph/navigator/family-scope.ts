/**
 * Exam scope of a FAMILY (step 5.8, JEE_ONTOLOGY §4; ADR-037): a family is outside the chosen exam scope when it has reactions and every
 * reaction that leaves it or arrives at it is `outside` under the active exam version. A family with no reaction is not outside (there is
 * nothing to study that the exam leaves out), and the scope of the family's own record is not used (a class is rarely mapped to a topic;
 * the reactions are what a family page studies). Derived, bounded by the family's candidates, with an early exit at the first reaction
 * that is not outside, so an exam scope with no `outside` reactions costs one lookup per family.
 */
import type { ProjectionContext } from '../contracts';

export function familyOutside(ctx: ProjectionContext, hubId: string): boolean {
  const rollup = ctx.indexes.navigatorRollup();
  const seen = new Set<string>();
  for (const list of [rollup.candidatesFrom(hubId), rollup.candidatesTo(hubId)]) {
    for (const candidate of list) {
      if (seen.has(candidate.reactionId)) continue;
      seen.add(candidate.reactionId);
      if (ctx.scopeOf({ kind: 'reaction', id: candidate.reactionId }) !== 'outside') return false;
    }
  }
  return seen.size > 0;
}
