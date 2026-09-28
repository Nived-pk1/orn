/**
 * L3 reaction rules RXN-013…RXN-024 (VALIDATION_RULES.md §3). RXN-014 and RXN-015 (conditions) are in
 * ./conditions.ts because they also apply to reagent profiles and caveat triggers.
 */
import type { Reaction, RecordRef } from '../../schema';
import type { ValidationRule } from '../contracts';
import { NO_REFERENCED_READS, asRef, at, existing, rule } from './helpers';
import { stagesOfParticipants, substanceKey } from './reaction-utils';

const REACTION = ['reaction'] as const;

/** Participants grouped by what makes two of them "the same use": substance, role, stage and variant scope. */
function usageKey(reaction: Reaction, index: number, stageIds: ReadonlyMap<string, readonly { readonly id: string }[]>): string {
  const p = reaction.participants[index];
  if (p === undefined) return '';
  const stages = (stageIds.get(p.id) ?? []).map((s) => s.id).join(',');
  const variants = reaction.conditionVariants.filter((v) => v.participantIds.includes(p.id)).map((v) => v.id).join(',');
  return `${substanceKey(p.ref)}|${p.role}|${stages}|${variants}`;
}

export const REACTION_MORE_RULES: readonly ValidationRule[] = [
  rule({
    id: 'RXN-013',
    level: 3,
    kinds: REACTION,
    defaultSeverity: 'error',
    scope: 'neighbourhood',
    // reads the generic reaction's scope and its own instanceOfId
    referencedReads: { reaction: ['scope', 'instanceOfId'] },
    description: 'instanceOfId target is not generic, this reaction is not specific, or the target is itself an instance',
    *check(reaction, ctx) {
      if (reaction.instanceOfId === undefined) return;
      const target = ctx.indexes.get(reaction.instanceOfId);
      if (target === undefined || target.kind !== 'reaction') return; // dangling: REF-001 / REF-002
      const problems: string[] = [];
      if (reaction.scope !== 'specific') problems.push('this reaction is not specific');
      if (target.scope !== 'generic') problems.push('the reaction it is an instance of is not generic');
      if (target.instanceOfId !== undefined) problems.push('the reaction it is an instance of is itself an instance');
      if (problems.length === 0) return;
      yield { path: 'instanceOfId', message: `Only a specific reaction can be an instance of a generic one, and instances do not nest: ${problems.join('; ')}.`, related: [asRef(target)] };
    },
  }),

  rule({
    id: 'RXN-016',
    level: 3,
    kinds: REACTION,
    defaultSeverity: 'info',
    scope: 'record',
    referencedReads: NO_REFERENCED_READS,
    description: 'Published reaction without reaction type, transformation and mechanism class',
    *check(reaction) {
      if (reaction.review.lifecycle !== 'published') return;
      const missing = [
        reaction.reactionTypes.length === 0 ? 'reaction type' : undefined,
        reaction.transformationIds.length === 0 ? 'transformation' : undefined,
        reaction.mechanismClasses.length === 0 ? 'mechanism class' : undefined,
      ].filter((text): text is string => text !== undefined);
      if (missing.length === 0) return;
      yield { path: 'reactionTypes', message: `This published reaction has no ${missing.join(', no ')}. Adding them makes it easier to find.` };
    },
  }),

  rule({
    id: 'RXN-017',
    level: 3,
    kinds: REACTION,
    defaultSeverity: 'warning',
    scope: 'record',
    referencedReads: NO_REFERENCED_READS,
    description: 'A product equals a reactant within one outcome',
    *check(reaction) {
      const reactants = new Set(reaction.participants.filter((p) => p.role === 'reactant').map((p) => substanceKey(p.ref)));
      for (const [i, outcome] of reaction.outcomes.entries()) {
        for (const [j, product] of outcome.products.entries()) {
          if (!reactants.has(substanceKey(product.ref))) continue;
          yield {
            path: at('outcomes', i, 'products', j, 'ref'),
            message: `Product ${j + 1} of outcome ${i + 1} is also a reactant of this reaction.`,
            related: [{ kind: product.ref.kind, id: product.ref.id }],
          };
        }
      }
    },
  }),

  rule({
    id: 'RXN-018',
    level: 3,
    kinds: REACTION,
    defaultSeverity: 'info',
    scope: 'neighbourhood',
    // reads relationships that point at this reaction (its referrers): reached by the referent expansion, not by its own references
    referencedReads: NO_REFERENCED_READS,
    description: 'Equilibrium without a reverse_of relationship or a note',
    *check(reaction, ctx) {
      if (reaction.reversibility.kind !== 'equilibrium' || reaction.reversibility.note !== undefined) return;
      const linked = ctx.indexes
        .referrersOf(reaction.id)
        .filter((r) => r.owner.kind === 'relationship' && (r.path === 'from' || r.path === 'to'));
      const hasReverse = existing(ctx, linked.map((r) => r.owner)).some((rel) => rel.kind === 'relationship' && rel.type === 'reverse_of');
      if (hasReverse) return;
      yield { path: 'reversibility.kind', message: 'This reaction is an equilibrium, but no reverse reaction is linked (reverse_of) and no note explains why.' };
    },
  }),

  rule({
    id: 'RXN-019',
    level: 3,
    kinds: REACTION,
    defaultSeverity: 'error',
    scope: 'record',
    referencedReads: NO_REFERENCED_READS,
    description: 'Intermediate with none of ref, label, structure',
    *check(reaction) {
      for (const [i, im] of reaction.intermediates.entries()) {
        if (im.ref !== undefined || im.label !== undefined || im.structure !== undefined) continue;
        yield { path: at('intermediates', i), message: `Intermediate ${i + 1} has no species, label or structure, so nothing says what it is.` };
      }
    },
  }),

  rule({
    id: 'RXN-020',
    level: 3,
    kinds: REACTION,
    defaultSeverity: 'warning',
    scope: 'record',
    referencedReads: NO_REFERENCED_READS,
    description: 'Condition variant referenced by no outcome (when at least two variants exist)',
    *check(reaction) {
      if (reaction.conditionVariants.length < 2) return;
      // An outcome with no variant list applies under every variant, so it covers them all.
      if (reaction.outcomes.some((o) => o.conditionVariantIds.length === 0)) return;
      const used = new Set(reaction.outcomes.flatMap((o) => o.conditionVariantIds));
      for (const [i, variant] of reaction.conditionVariants.entries()) {
        if (used.has(variant.id)) continue;
        yield { path: at('conditionVariants', i), message: `Condition variant "${variant.label}" is not used by any outcome.` };
      }
    },
  }),

  rule({
    id: 'RXN-021',
    level: 3,
    kinds: REACTION,
    defaultSeverity: 'warning',
    scope: 'record',
    referencedReads: NO_REFERENCED_READS,
    description: 'Same substance twice with the same role',
    *check(reaction) {
      const stages = stagesOfParticipants(reaction);
      const first = new Map<string, number>();
      for (const [i, p] of reaction.participants.entries()) {
        const key = usageKey(reaction, i, stages);
        const earlier = first.get(key);
        if (earlier === undefined) {
          first.set(key, i);
          continue;
        }
        yield {
          path: at('participants', i, 'ref'),
          message: `Participant ${i + 1} repeats participant ${earlier + 1} (same ${p.ref.kind}, same role). Use a coefficient instead.`,
          related: [{ kind: p.ref.kind, id: p.ref.id }],
        };
      }
    },
  }),

  rule({
    id: 'RXN-022',
    level: 3,
    kinds: REACTION,
    defaultSeverity: 'warning',
    scope: 'record',
    referencedReads: NO_REFERENCED_READS,
    description: 'Scope mismatch: generic reaction without class refs, or specific reaction with class refs',
    *check(reaction) {
      const refs: RecordRef[] = [
        ...reaction.participants.map((p) => p.ref),
        ...reaction.outcomes.flatMap((o) => o.products.map((p) => p.ref)),
        ...reaction.intermediates.flatMap((im) => (im.ref === undefined ? [] : [im.ref])),
      ];
      const classes = refs.filter((ref) => ref.kind === 'class').length;
      if (reaction.scope === 'generic' && classes === 0) {
        yield { path: 'scope', message: 'This reaction is generic but names no class. A generic reaction is written with classes such as R–OH.' };
      } else if (reaction.scope === 'specific' && classes > 0) {
        yield { path: 'scope', message: `This reaction is specific but names ${classes} class reference${classes === 1 ? '' : 's'}. A specific reaction uses concrete species.` };
      }
    },
  }),

  rule({
    id: 'RXN-023',
    level: 3,
    kinds: REACTION,
    defaultSeverity: 'warning',
    scope: 'record',
    referencedReads: NO_REFERENCED_READS,
    description: 'workup_reagent outside a workup/quench stage when stages exist',
    *check(reaction) {
      if (reaction.stages.length === 0) return;
      const stages = stagesOfParticipants(reaction);
      for (const [i, p] of reaction.participants.entries()) {
        if (p.role !== 'workup_reagent') continue;
        const in_ = stages.get(p.id) ?? [];
        if (in_.length === 0 || in_.some((s) => s.kind === 'workup' || s.kind === 'quench')) continue; // none: RXN-007
        yield { path: at('participants', i, 'role'), message: `Participant ${i + 1} is a work-up reagent, but it is not in a work-up or quench stage.` };
      }
    },
  }),

  rule({
    id: 'RXN-024',
    level: 3,
    kinds: REACTION,
    defaultSeverity: 'info',
    scope: 'record',
    referencedReads: NO_REFERENCED_READS,
    description: 'Coefficient on a catalyst or solvent',
    *check(reaction) {
      for (const [i, p] of reaction.participants.entries()) {
        if ((p.role !== 'catalyst' && p.role !== 'solvent') || p.coefficient === undefined) continue;
        yield { path: at('participants', i, 'coefficient'), message: `Participant ${i + 1} is a ${p.role} with a coefficient. Catalysts and solvents are not counted in the equation; use the quantity field.` };
      }
    },
  }),
];
