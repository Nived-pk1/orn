/**
 * reactionCard (step 7.1b, ADR-042 E5): the card of a WHOLE reaction for the Reactions list. It is built by the same code as a family
 * page's card (the carried substrate, every outcome group in the group rule's order, the same named reactions, caveat count and status),
 * with `elsewhere` empty; where no card can be built it says why in words.
 */
import { describe, expect, it } from 'vitest';
import { familyStudy, reactionCard, type FamilyCard, type ReactionCardMissing } from '..';
import { UNCLASSIFIED_HUB_ID } from '../navigator/hubs';
import { demoState } from '@/test-support/app-boot-kit';
import { contextOf } from '@/test-support/graph-state';
import type { Reaction } from '../../schema';

const demo = contextOf(demoState());
const reactions = Object.values(demo.state.records.reaction) as Reaction[];
const isCard = (value: FamilyCard | ReactionCardMissing): value is FamilyCard => !('missing' in value);

/** Every card of every family page, by reaction. */
function familyCards(): Map<string, FamilyCard[]> {
  const out = new Map<string, FamilyCard[]>();
  for (const hub of [...demo.indexes.navigatorRollup().hubs.map((h) => h.id), UNCLASSIFIED_HUB_ID]) {
    const study = familyStudy(demo, hub);
    for (const section of [study?.reactionsOf, study?.preparationOf]) for (const group of section?.groups ?? []) for (const card of group.cards.flatMap((one) => [one, ...(one.examples ?? [])])) out.set(card.reactionId, [...(out.get(card.reactionId) ?? []), card]);
  }
  return out;
}

describe('reactionCard on the demo', () => {
  const pages = familyCards();

  it('every reaction that is on a family page has a card; the one with no main product says why', () => {
    const missing = reactions.filter((r) => !isCard(reactionCard(demo, r.id)));
    expect(missing.map((r) => r.id)).toEqual(reactions.filter((r) => !pages.has(r.id)).map((r) => r.id));
    expect(missing).toHaveLength(1);
    const answer = reactionCard(demo, (missing[0] as Reaction).id) as ReactionCardMissing;
    expect(answer.missing).toBe(true);
    expect(answer.reason).toBe('No main product is marked, so this reaction has no card.');
  });

  it('carries the same name, status, named reactions, caveat count and substrate as its family-page cards', () => {
    for (const r of reactions) {
      const card = reactionCard(demo, r.id);
      if (!isCard(card)) continue;
      for (const page of pages.get(r.id) ?? []) {
        expect({ name: card.name, status: card.reviewStatus, named: card.namedReactions, caveats: card.caveatCount, substrate: card.substrate }).toEqual({ name: page.name, status: page.reviewStatus, named: page.namedReactions, caveats: page.caveatCount, substrate: page.substrate });
      }
      expect(card.elsewhere).toEqual([]);
    }
  });

  it('a reaction whose cards on the family pages have nothing elsewhere has the SAME groups as each of them', () => {
    let compared = 0;
    for (const r of reactions) {
      const card = reactionCard(demo, r.id);
      const page = pages.get(r.id) ?? [];
      if (!isCard(card) || page.length === 0 || page.some((one) => one.elsewhere.length > 0)) continue;
      for (const one of page) expect(card.groups, r.id).toEqual(one.groups);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(10);
  });

  it('a reaction with outcomes in two families has ONE card with every group (ethanol with conc. H2SO4: 413 K and 443 K)', () => {
    const r = reactions.find((one) => one.name.includes('Ethanol + conc. H₂SO₄')) as Reaction;
    const card = reactionCard(demo, r.id) as FamilyCard;
    expect(card.groups.map((g) => g.arrowText.below.map((p) => p.text))).toEqual([['413 K'], ['443 K']]);
    expect(card.elsewhere).toEqual([]);
    expect(card.key).toBe(`reaction:${r.id}`);
  });

  it('is deterministic', () => {
    const r = reactions[0] as Reaction;
    expect(reactionCard(demo, r.id)).toEqual(reactionCard(demo, r.id));
  });

  it('an unknown id says the reaction is not in the dataset', () => {
    expect(reactionCard(demo, 'rxn_nowhere')).toEqual({ missing: true, reactionId: 'rxn_nowhere', reason: 'This reaction is not in the dataset.' });
  });
});

describe('reactionCard on changed copies of the demo', () => {
  const changed = (id: string, patch: Partial<Reaction>) => contextOf({ ...demo.state, records: { ...demo.state.records, reaction: { ...demo.state.records.reaction, [id]: { ...(demo.state.records.reaction[id as never] as Reaction), ...patch } } } });

  it('no starting material: says so', () => {
    const pcc = reactions.find((one) => one.name.includes('PCC')) as Reaction;
    const answer = reactionCard(changed(pcc.id, { participants: [] }), pcc.id) as ReactionCardMissing;
    expect(answer.reason).toBe('No starting material is marked, so this reaction has no card.');
  });

  it('no outcome at all: says no main product', () => {
    const pcc = reactions.find((one) => one.name.includes('PCC')) as Reaction;
    const answer = reactionCard(changed(pcc.id, { outcomes: [] }), pcc.id) as ReactionCardMissing;
    expect(answer.reason).toBe('No main product is marked, so this reaction has no card.');
  });
});
