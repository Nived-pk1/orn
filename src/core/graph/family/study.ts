/**
 * familyStudy (step 5.5b; ADR-037; docs/GRAPH_SEMANTICS.md §3, §8): the value behind the navigator's family page, built from the
 * navigator roll-up index (the candidates from and to the hub; no scan of every reaction).
 *
 * Two sections. "Reactions of <family>": candidates whose carried substrate resolves to the hub, grouped by the family of the main
 * product. "Preparation of <family>": candidates whose main product resolves to the hub, grouped by the family of the carried
 * substrate. A reaction of a family into itself is in both sections, in the group of its own family. Unclassified is a family like the
 * others. Groups are ordered by the anchor's `order`, then name, Unclassified last; cards in a group by folded reaction name, then ID
 * (display order only). One card per (reaction, group); outcomes of the same reaction that land in other groups of the section are
 * counted on the card with where they go. Work is proportional to the hub's candidates (and the schemes referring to those reactions).
 */
import type { NavigatorCandidate } from '../../indexes/contracts';
import type { ConditionVariantId, ParticipantId, Reaction, RecordRef } from '../../schema';
import { fold } from '../../text';
import { arrowTextOf } from '../arrow-text';
import type { ProjectionContext } from '../contracts';
import { UNCLASSIFIED_HUB_ID } from '../navigator/hubs';
import { arrangementsOf } from '../navigator/nodes';
import { cardOf, createCardKit, type CardKit, type GatheredOutcome } from './card';
import { exampleLookupOf, foldExamples } from './examples';
import type {
  FamilyCard,
  FamilyElsewhere,
  FamilyGroup,
  FamilyPartner,
  FamilyReactionType,
  FamilySection,
  FamilySectionKind,
  FamilyStudy,
} from './types';

export const UNCLASSIFIED_NAME = 'Unclassified';

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);


interface HubInfo {
  readonly name: string;
  readonly order: number;
}

type GatheringOutcome = GatheredOutcome & { readonly products: NavigatorCandidate[] };

/** One reaction's candidates in one group of a section, outcome by outcome. */
interface Gathered {
  readonly substrate: RecordRef;
  readonly participantId: NavigatorCandidate['participantId'];
  readonly outcomes: Map<string, GatheringOutcome>;
}

function hubInfoOf(ctx: ProjectionContext, hubs: readonly RecordRef[], describer: CardKit['describer']): Map<string, HubInfo> {
  const orderOf = new Map<string, number>();
  for (const anchor of ctx.indexes.anchors()) if (!orderOf.has(anchor.target.id)) orderOf.set(anchor.target.id, anchor.order);
  const info = new Map<string, HubInfo>();
  for (const hub of hubs) info.set(hub.id, { name: describer.describe(hub)?.name ?? hub.id, order: orderOf.get(hub.id) ?? 0 });
  info.set(UNCLASSIFIED_HUB_ID, { name: UNCLASSIFIED_NAME, order: Number.POSITIVE_INFINITY });
  return info;
}

type Ranked = { readonly hubId: string; readonly info: HubInfo };

function compareGroups(a: Ranked, b: Ranked): number {
  const aLast = a.hubId === UNCLASSIFIED_HUB_ID;
  const bLast = b.hubId === UNCLASSIFIED_HUB_ID;
  if (aLast !== bLast) return aLast ? 1 : -1;
  return a.info.order - b.info.order || compare(fold(a.info.name), fold(b.info.name)) || compare(a.hubId, b.hubId);
}

export function familyStudy(ctx: ProjectionContext, hubId: string): FamilyStudy | null {
  const rollup = ctx.indexes.navigatorRollup();
  if (hubId !== UNCLASSIFIED_HUB_ID && !rollup.hubs.some((hub) => hub.id === hubId)) return null;
  const kit = createCardKit(ctx);
  const { describer, schemesOf, shownAsNode } = kit;
  const infos = hubInfoOf(ctx, rollup.hubs, describer);
  const hubInfo = (id: string): HubInfo => infos.get(id) ?? { name: id, order: 0 };
  const ranked = (id: string): Ranked => ({ hubId: id, info: hubInfo(id) });
  const hubRef = rollup.hubs.find((hub) => hub.id === hubId) ?? null;
  const seenReactions = new Map<string, Reaction>();
  const lookup = exampleLookupOf(ctx.state);

  const buildSection = (kind: FamilySectionKind): FamilySection => {
    const candidates = kind === 'reactions_of' ? rollup.candidatesFrom(hubId) : rollup.candidatesTo(hubId);
    const groupOf = (c: NavigatorCandidate): string => (kind === 'reactions_of' ? c.toHub : c.fromHub);
    const groups = new Map<string, Map<string, Gathered>>();
    // reaction -> group -> outcome ID -> its variants and carried participant (for "elsewhere")
    type Landed = { readonly variantIds: readonly ConditionVariantId[]; readonly participantId: ParticipantId };
    const landing = new Map<string, Map<string, Map<string, Landed>>>();
    for (const c of candidates) {
      const reaction = ctx.state.records.reaction[c.reactionId];
      if (reaction === undefined) continue;
      seenReactions.set(reaction.id, reaction);
      const group = groupOf(c);
      let reactions = groups.get(group);
      if (reactions === undefined) groups.set(group, (reactions = new Map()));
      let gathered = reactions.get(c.reactionId);
      if (gathered === undefined) reactions.set(c.reactionId, (gathered = { substrate: c.substrate, participantId: c.participantId, outcomes: new Map() }));
      let outcome = gathered.outcomes.get(c.outcomeId);
      if (outcome === undefined) gathered.outcomes.set(c.outcomeId, (outcome = { variantIds: c.conditionVariantIds, products: [] }));
      outcome.products.push(c);
      let byGroup = landing.get(c.reactionId);
      if (byGroup === undefined) landing.set(c.reactionId, (byGroup = new Map()));
      let outcomes = byGroup.get(group);
      if (outcomes === undefined) byGroup.set(group, (outcomes = new Map()));
      if (!outcomes.has(c.outcomeId)) outcomes.set(c.outcomeId, { variantIds: c.conditionVariantIds, participantId: c.participantId });
    }
    const built: FamilyGroup[] = [];
    const cardIds = new Set<string>();
    const foldedIds = new Set<string>();
    const onlyFolded = new Set<string>();
    for (const [group, reactions] of [...groups].sort((a, b) => compareGroups(ranked(a[0]), ranked(b[0])))) {
      const cards: FamilyCard[] = [];
      for (const [reactionId, gathered] of reactions) {
        const reaction = seenReactions.get(reactionId) as Reaction;
        // The condition words of the outcomes that land in another group (distinct, in outcome ID order): "443 K".
        const conditionTextOf = (r: Reaction, landed: ReadonlyMap<string, Landed>): string => {
          const texts: string[] = [];
          for (const [, l] of [...landed].sort((a, b) => compare(a[0], b[0]))) {
            const parts = arrowTextOf(r, {
              schemes: schemesOf(r.id),
              conditionVariantIds: l.variantIds,
              carriedParticipantId: l.participantId,
              describe: describer.describeForArrow,
              shownAsNode,
            }).below.filter((part) => part.kind === 'condition');
            const text = parts.map((part) => part.text).join(', ');
            if (text !== '' && !texts.includes(text)) texts.push(text);
          }
          return texts.join('; ');
        };
        const elsewhere: FamilyElsewhere[] = [...(landing.get(reactionId) ?? [])]
          .filter(([other]) => other !== group)
          .map(([other, landed]) => ({ hubId: other, name: hubInfo(other).name, outcomeCount: landed.size, conditionText: conditionTextOf(reaction, landed) }))
          .sort((a, b) => compareGroups(ranked(a.hubId), ranked(b.hubId)));
        cards.push(cardOf(kit, reaction, `${kind}:${group}:${reactionId}`, gathered, elsewhere));
      }
      cards.sort((a, b) => compare(fold(a.name), fold(b.name)) || compare(a.reactionId, b.reactionId));
      // 7.3a C1, C2: an example folds under its general reaction's card in THIS group; otherwise it is a card with "Example of"
      const folding = foldExamples(cards.map((card) => card.reactionId), lookup);
      const byId = new Map(cards.map((card) => [card.reactionId as string, card]));
      const shownCards = folding.shown.map((id): FamilyCard => {
        const card = byId.get(id) as FamilyCard;
        const examples = (folding.examplesOf.get(id) ?? []).map((one) => byId.get(one) as FamilyCard);
        const general = folding.exampleOf.get(id);
        return { ...card, ...(examples.length === 0 ? {} : { examples }), ...(general === undefined ? {} : { exampleOf: { reactionId: general, name: ctx.state.records.reaction[general]?.name ?? general } }) };
      });
      for (const card of shownCards) cardIds.add(card.reactionId);
      for (const examples of folding.examplesOf.values()) for (const id of examples) foldedIds.add(id);
      built.push({ hubId: group, name: hubInfo(group).name, cards: shownCards, exampleCount: folding.folded });
    }
    for (const id of foldedIds) if (!cardIds.has(id as never)) onlyFolded.add(id);
    return { kind, reactionCount: cardIds.size, exampleCount: onlyFolded.size, groups: built };
  };

  const reactionsOf = buildSection('reactions_of');
  const preparationOf = buildSection('preparation_of');
  // distinct CARDS in the family and the examples that are folded and no card anywhere in it (7.3a C3)
  const allCards = new Set<string>([...reactionsOf.groups, ...preparationOf.groups].flatMap((g) => g.cards.map((c) => c.reactionId as string)));
  const allFolded = new Set<string>([...reactionsOf.groups, ...preparationOf.groups].flatMap((g) => g.cards.flatMap((c) => (c.examples ?? []).map((e) => e.reactionId as string))).filter((id) => !allCards.has(id)));

  const arrangements = arrangementsOf(ctx);
  const partners = (section: FamilySection): FamilyPartner[] =>
    section.groups.map((g) => {
      const tone = arrangements.get(g.hubId)?.tone;
      return { hubId: g.hubId, name: g.name, reactionCount: g.cards.length, ...(tone === undefined ? {} : { tone }) };
    });
  const typeCounts = new Map<string, number>();
  for (const reaction of seenReactions.values()) {
    for (const id of new Set(reaction.reactionTypes.map((t) => t.conceptId as string))) typeCounts.set(id, (typeCounts.get(id) ?? 0) + 1);
  }
  const reactionTypes: FamilyReactionType[] = [...typeCounts]
    .map(([conceptId, count]) => ({ conceptId, name: ctx.state.records.concept[conceptId]?.name ?? conceptId, count }))
    .sort((a, b) => b.count - a.count || compare(fold(a.name), fold(b.name)) || compare(a.conceptId, b.conceptId));

  const described = hubRef === null ? undefined : describer.describe(hubRef);
  const arrangement = hubRef === null ? undefined : arrangements.get(hubRef.id);
  return {
    hubId,
    hub: hubRef,
    name: hubInfo(hubId).name,
    ...(described?.formula === undefined ? {} : { formula: described.formula }),
    ...(arrangement?.group === undefined ? {} : { group: arrangement.group }),
    ...(arrangement?.tone === undefined ? {} : { tone: arrangement.tone }),
    counts: { reactionsOf: reactionsOf.reactionCount, preparationOf: preparationOf.reactionCount, total: allCards.size, examples: allFolded.size },
    reactionTypes,
    madeFrom: partners(preparationOf),
    turnsInto: partners(reactionsOf),
    reactionsOf,
    preparationOf,
  };
}
