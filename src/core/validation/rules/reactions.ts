/**
 * L3 reaction rules RXN-001…RXN-012 (VALIDATION_RULES.md §3): completeness, participants, stages and
 * outcome consistency. All are record-scope: a reaction is judged from its own content.
 */
import type { ValidationRule } from '../contracts';
import { at, lifecycleSeverity, rule } from './helpers';
import { outcomeName, stagesOfParticipants, variantsOverlap } from './reaction-utils';

const REACTION = ['reaction'] as const;

export const REACTION_RULES: readonly ValidationRule[] = [
  rule({
    id: 'RXN-001',
    level: 3,
    kinds: REACTION,
    defaultSeverity: 'warning',
    scope: 'record',
    description: 'No reactant participant (draft WARNING / published ERROR)',
    *check(reaction) {
      if (reaction.participants.some((p) => p.role === 'reactant')) return;
      yield { path: 'participants', severity: lifecycleSeverity(reaction), message: `"${reaction.name}" has no reactant.` };
    },
  }),

  rule({
    id: 'RXN-002',
    level: 3,
    kinds: REACTION,
    defaultSeverity: 'warning',
    scope: 'record',
    description: 'No outcome with at least one product (draft WARNING / published ERROR)',
    *check(reaction) {
      if (reaction.outcomes.some((o) => o.products.length > 0)) return;
      yield {
        path: 'outcomes',
        severity: lifecycleSeverity(reaction),
        message: `"${reaction.name}" has no outcome with a product.`,
      };
    },
  }),

  rule({
    id: 'RXN-003',
    level: 3,
    kinds: REACTION,
    defaultSeverity: 'warning',
    scope: 'record',
    description: 'An outcome has zero products (draft WARNING / published ERROR)',
    *check(reaction) {
      for (const [i, outcome] of reaction.outcomes.entries()) {
        if (outcome.products.length > 0) continue;
        yield {
          path: at('outcomes', i, 'products'),
          severity: lifecycleSeverity(reaction),
          message: `${outcomeName(outcome, i)} has no products.`,
        };
      }
    },
  }),

  rule({
    id: 'RXN-004',
    level: 3,
    kinds: REACTION,
    defaultSeverity: 'error',
    scope: 'record',
    description: 'Spectator with contributesAtoms: true',
    *check(reaction) {
      for (const [i, p] of reaction.participants.entries()) {
        if (p.role !== 'spectator' || p.flags?.contributesAtoms !== true) continue;
        yield {
          path: at('participants', i, 'flags', 'contributesAtoms'),
          message: `Participant ${i + 1} is a spectator, so it cannot contribute atoms to the products. Change its role or clear the flag.`,
        };
      }
    },
  }),

  rule({
    id: 'RXN-005',
    level: 3,
    kinds: REACTION,
    defaultSeverity: 'warning',
    scope: 'record',
    description: 'Catalyst flagged consumed',
    *check(reaction) {
      for (const [i, p] of reaction.participants.entries()) {
        if (p.role !== 'catalyst' || p.flags?.consumed !== true) continue;
        yield {
          path: at('participants', i, 'flags', 'consumed'),
          message: `Participant ${i + 1} is a catalyst but is marked as consumed. If it is used up (as AlCl₃ is in Friedel–Crafts acylation), give it the role reagent and add a caveat.`,
        };
      }
    },
  }),

  rule({
    id: 'RXN-006',
    level: 3,
    kinds: REACTION,
    defaultSeverity: 'warning',
    scope: 'record',
    description: 'More than one primary substrate',
    *check(reaction) {
      const primary = reaction.participants.filter((p) => p.isPrimarySubstrate === true);
      if (primary.length < 2) return;
      yield { path: 'participants', message: `${primary.length} participants are marked as the primary substrate; only one should be.`, data: { count: primary.length } };
    },
  }),

  rule({
    id: 'RXN-007',
    level: 3,
    kinds: REACTION,
    defaultSeverity: 'error',
    scope: 'record',
    description: 'With stages present, every participant is in exactly one stage',
    *check(reaction) {
      if (reaction.stages.length === 0) return;
      const stagesOf = stagesOfParticipants(reaction);
      for (const [i, p] of reaction.participants.entries()) {
        const n = stagesOf.get(p.id)?.length ?? 0;
        if (n === 1) continue;
        yield {
          path: at('participants', i),
          message: n === 0 ? `Participant ${i + 1} is in no stage.` : `Participant ${i + 1} is in ${n} stages; it belongs in exactly one.`,
          data: { stages: n },
        };
      }
    },
  }),

  rule({
    id: 'RXN-008',
    level: 3,
    kinds: REACTION,
    defaultSeverity: 'error',
    scope: 'record',
    description: 'An exclusive outcome overlaps another outcome for the same variants',
    *check(reaction) {
      for (const [i, outcome] of reaction.outcomes.entries()) {
        if (outcome.selectivity !== 'exclusive') continue;
        const clashing = reaction.outcomes
          .map((other, j) => [other, j] as const)
          .filter(([other, j]) => j !== i && variantsOverlap(outcome.conditionVariantIds, other.conditionVariantIds));
        if (clashing.length === 0) continue;
        yield {
          path: at('outcomes', i, 'selectivity'),
          message: `${outcomeName(outcome, i)} is exclusive, but ${clashing.map(([o, j]) => outcomeName(o, j)).join(', ')} apply${clashing.length === 1 ? 's' : ''} under some of the same conditions.`,
          data: { overlapping: clashing.map(([o]) => o.id) },
        };
      }
    },
  }),

  rule({
    id: 'RXN-009',
    level: 3,
    kinds: REACTION,
    defaultSeverity: 'warning',
    scope: 'record',
    description: 'A minor outcome without a major outcome for an overlapping variant set',
    *check(reaction) {
      for (const [i, outcome] of reaction.outcomes.entries()) {
        if (outcome.selectivity !== 'minor') continue;
        const hasMajor = reaction.outcomes.some(
          (other) => other.selectivity === 'major' && variantsOverlap(outcome.conditionVariantIds, other.conditionVariantIds),
        );
        if (hasMajor) continue;
        yield {
          path: at('outcomes', i, 'selectivity'),
          message: `${outcomeName(outcome, i)} is marked minor, but no major outcome exists for the same conditions.`,
        };
      }
    },
  }),

  rule({
    id: 'RXN-010',
    level: 3,
    kinds: REACTION,
    defaultSeverity: 'warning',
    scope: 'record',
    description: 'More than one major outcome for the same variant set and isomer group',
    *check(reaction) {
      const majors = reaction.outcomes.map((o, i) => [o, i] as const).filter(([o]) => o.selectivity === 'major');
      for (const [k, [outcome, i]] of majors.entries()) {
        const earlier = majors
          .slice(0, k)
          .filter(([o]) => (o.isomerGroup ?? '') === (outcome.isomerGroup ?? '') && variantsOverlap(o.conditionVariantIds, outcome.conditionVariantIds));
        if (earlier.length === 0) continue;
        yield {
          path: at('outcomes', i, 'selectivity'),
          message: `${outcomeName(outcome, i)} is major, like ${earlier.map(([o, j]) => outcomeName(o, j)).join(', ')}, under the same conditions and isomer group. Only one should be major.`,
        };
      }
    },
  }),

  rule({
    id: 'RXN-011',
    level: 3,
    kinds: REACTION,
    defaultSeverity: 'error',
    scope: 'record',
    description: 'profileId on a participant whose ref is not a reagent',
    *check(reaction) {
      for (const [i, p] of reaction.participants.entries()) {
        if (p.profileId === undefined || p.ref.kind === 'reagent') continue;
        yield {
          path: at('participants', i, 'profileId'),
          message: `Participant ${i + 1} names a reagent profile, but it is a ${p.ref.kind}, not a reagent.`,
        };
      }
    },
  }),

  rule({
    id: 'RXN-012',
    level: 3,
    kinds: REACTION,
    defaultSeverity: 'info',
    scope: 'record',
    description: 'Some outcomes are variant-specific while others apply to all variants',
    *check(reaction) {
      const scoped = reaction.outcomes.filter((o) => o.conditionVariantIds.length > 0).length;
      if (scoped === 0 || scoped === reaction.outcomes.length) return;
      yield {
        path: 'outcomes',
        message: `${scoped} outcome${scoped === 1 ? ' is' : 's are'} tied to condition variants while the other${reaction.outcomes.length - scoped === 1 ? ' applies' : 's apply'} to all of them. Check that this is intended.`,
      };
    },
  }),
];
