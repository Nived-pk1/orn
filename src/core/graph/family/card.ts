/**
 * The ONE place a reaction card is built (step 7.1b; before, inline in `familyStudy`): the groups of a card's outcomes, and the rest of the
 * card (name, named reactions, status, caveat count, substrate). A family page builds a card from the candidates of one group; the Reactions
 * list builds the card of a WHOLE reaction (`reactionCard`) from the same code, with every outcome and nothing "elsewhere". Pure; derived.
 */
import type { NavigatorCandidate } from '../../indexes/contracts';
import { mainProductsOf, primarySubstrateOf } from '../../indexes/navigator-rollup';
import type { ParticipantId, Reaction, ReactionScheme, RecordRef } from '../../schema';
import type { ProjectionContext } from '../contracts';
import { selectivityWordOf } from '../selectivity-word';
import { createDescriber } from './describe';
import { outcomeGroupsOf, type OutcomeDraft } from './groups';
import type { FamilyCard, FamilyCardOutcome, FamilyElsewhere, FamilyOutcomeGroup, FamilyProduct } from './types';

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** What a card needs of a roll-up candidate (a `NavigatorCandidate` fits). */
export type CardCandidate = Pick<NavigatorCandidate, 'productId' | 'product' | 'selectivity'>;

export interface GatheredOutcome {
  readonly variantIds: NavigatorCandidate['conditionVariantIds'];
  readonly products: readonly CardCandidate[];
}

/** One reaction's outcomes as a card shows them, outcome by outcome. */
export interface Gathered {
  readonly substrate: RecordRef;
  readonly participantId: NavigatorCandidate['participantId'];
  readonly outcomes: ReadonlyMap<string, GatheredOutcome>;
}

/** What building cards needs from the context, made once per study (or per call). */
export interface CardKit {
  readonly ctx: ProjectionContext;
  readonly describer: ReturnType<typeof createDescriber>;
  schemesOf(reactionId: string): readonly ReactionScheme[];
  shownAsNode(ref: RecordRef): boolean;
}

export function createCardKit(ctx: ProjectionContext): CardKit {
  const describer = createDescriber(ctx.state);
  const schemesCache = new Map<string, readonly ReactionScheme[]>();
  return {
    ctx,
    describer,
    shownAsNode: (ref) => ctx.indexes.displayOf(ref)?.showAsNode !== 'never',
    schemesOf(reactionId) {
      let found = schemesCache.get(reactionId);
      if (found === undefined) {
        const ids = new Set(ctx.indexes.referrersOf(reactionId).filter((r) => r.owner.kind === 'reaction_scheme').map((r) => r.owner.id));
        found = [...ids].map((id) => ctx.state.records.reaction_scheme[id]).filter((s): s is ReactionScheme => s !== undefined);
        schemesCache.set(reactionId, found);
      }
      return found;
    },
  };
}

/** The outcome groups of a card: the outcomes in the record's own order, grouped by the group rule. */
export function cardGroupsOf(kit: CardKit, reaction: Reaction, gathered: Gathered): readonly FamilyOutcomeGroup[] {
  const storedIndex = (outcomeId: string): number => reaction.outcomes.findIndex((x) => x.id === outcomeId);
  const entries = [...gathered.outcomes]
    .sort((a, b) => storedIndex(a[0]) - storedIndex(b[0]) || compare(a[0], b[0]))
    .map(([outcomeId, o]) => {
      const stored = reaction.outcomes.find((x) => x.id === outcomeId);
      const products: FamilyProduct[] = o.products
        .slice()
        .sort((a, b) => compare(a.productId, b.productId))
        .map((p) => {
          const writtenAs = p.product.kind === 'class' ? stored?.products.find((x) => x.id === p.productId)?.originalText : undefined;
          return { productId: p.productId, ref: p.product, selectivity: selectivityWordOf(p.selectivity), ...(writtenAs === undefined || writtenAs === '' ? {} : { writtenAs }) };
        });
      const card: OutcomeDraft = {
        outcomeId: outcomeId as FamilyCardOutcome['outcomeId'],
        conditionVariantIds: o.variantIds,
        products,
        selectivity: stored?.selectivity ?? 'unspecified',
        ...(stored?.regiochemistry === undefined ? {} : { regiochemistry: stored.regiochemistry }),
      };
      return { card, stored };
    });
  return outcomeGroupsOf(reaction, entries, { schemes: kit.schemesOf(reaction.id), participantId: gathered.participantId, describer: kit.describer, shownAsNode: kit.shownAsNode });
}

/** The card: what is the same wherever the reaction is shown. */
export function cardOf(kit: CardKit, reaction: Reaction, key: string, gathered: Gathered, elsewhere: readonly FamilyElsewhere[]): FamilyCard {
  const { ctx } = kit;
  const carried = gathered.substrate.kind === 'class' ? reaction.participants.find((x) => x.id === gathered.participantId)?.originalText : undefined;
  const substrateWrittenAs = carried === undefined || carried === '' ? undefined : carried;
  return {
    key,
    reactionId: reaction.id,
    name: reaction.name,
    namedReactions: reaction.namedReactionIds.map((id) => ({ id, name: ctx.state.records.named_reaction[id]?.name ?? id })),
    reviewStatus: reaction.review.status,
    caveatCount: ctx.indexes.caveatsFor({ kind: 'reaction', id: reaction.id } as RecordRef).length,
    substrate: gathered.substrate,
    ...(substrateWrittenAs === undefined ? {} : { substrateWrittenAs }),
    groups: cardGroupsOf(kit, reaction, gathered),
    elsewhere,
  };
}

export interface ReactionCardMissing {
  readonly missing: true;
  readonly reactionId: string;
  /** In words: why this reaction has no card (the list then shows its compact row with this). */
  readonly reason: string;
}

/**
 * The card of a WHOLE reaction (ADR-042 E5): the carried substrate, EVERY outcome group in the group rule's order, `elsewhere` empty. The
 * candidates are the ones the roll-up makes for the reaction (an outcome's drawable main products with the carried substrate), so a card
 * exists exactly for the reactions that are on some family page.
 */
export function reactionCard(ctx: ProjectionContext, reactionId: string): FamilyCard | ReactionCardMissing {
  const reaction = ctx.state.records.reaction[reactionId as keyof typeof ctx.state.records.reaction] as Reaction | undefined;
  if (reaction === undefined) return { missing: true, reactionId, reason: 'This reaction is not in the dataset.' };
  const substrate = primarySubstrateOf(ctx.indexes, reaction);
  if (substrate === undefined) return { missing: true, reactionId, reason: 'No starting material is marked, so this reaction has no card.' };
  const mains = mainProductsOf(ctx.indexes, reaction);
  if (mains.length === 0) return { missing: true, reactionId, reason: 'No main product is marked, so this reaction has no card.' };
  const outcomes = new Map<string, { variantIds: NavigatorCandidate['conditionVariantIds']; products: CardCandidate[] }>();
  for (const { outcome, product } of mains) {
    let gathered = outcomes.get(outcome.id);
    if (gathered === undefined) outcomes.set(outcome.id, (gathered = { variantIds: outcome.conditionVariantIds, products: [] }));
    gathered.products.push({ productId: product.id, product: product.ref, selectivity: outcome.selectivity });
  }
  const gathered: Gathered = { substrate: substrate.ref, participantId: substrate.id as ParticipantId, outcomes };
  return cardOf(createCardKit(ctx), reaction, `reaction:${reaction.id}`, gathered, []);
}
