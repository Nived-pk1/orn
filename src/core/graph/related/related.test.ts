/**
 * Related reactions on the demo dataset (step 5.6b, item c): a table of what the demo gives. Each mechanism of the demo is used by ONE
 * reaction, so "shares a mechanism" is empty everywhere; the diethyl ether made at 413 K is consumed by no reaction of the demo.
 */
import { describe, expect, it } from 'vitest';
import { relatedReactionsOf, type RelatedGroup } from '@/core/graph';
import type { Reaction } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { contextOf } from '@/test-support/graph-state';

const state = demoState();
const { indexes } = contextOf(state);
const groupsOf = (id: string): Record<string, RelatedGroup> => {
  const reaction = (state.records.reaction as Record<string, Reaction>)[id] as Reaction;
  return Object.fromEntries(relatedReactionsOf(indexes, reaction).map((g) => [g.key, g]));
};
const ids = (group: RelatedGroup | undefined): string[] => (group?.items ?? []).map((i) => i.reactionId);

describe('related reactions of the demo', () => {
  it('leads on to and comes from, stated by exact species', () => {
    const diazotisation = groupsOf('rxn_aniline-diazotisation');
    expect(ids(diazotisation.leads_on)).toEqual(['rxn_benzenediazonium-sandmeyer', 'rxn_benzenediazonium-to-phenol']);
    expect(diazotisation.leads_on?.items.every((i) => !i.inferred)).toBe(true);
    expect(ids(groupsOf('rxn_benzenediazonium-sandmeyer').comes_from)).toEqual(['rxn_aniline-diazotisation']);
  });

  it('the by-product (water) is not what a reaction leads on with', () => {
    expect(ids(groupsOf('rxn_aniline-diazotisation').leads_on)).not.toContain('rxn_ethyl-ethanoate-hydrolysis');
  });

  it('a link through a class is inferred and says which class', () => {
    const item = groupsOf('rxn_ethene-hydration').leads_on?.items.find((i) => i.reactionId === 'rxn_alcohol1-to-aldehyde-pcc');
    expect(item?.inferred).toBe(true);
    expect(item?.via?.kind).toBe('class');
    // stated entries come before inferred ones
    const flags = (groupsOf('rxn_ethene-hydration').leads_on?.items ?? []).map((i) => i.inferred);
    expect(flags).toEqual([...flags].sort((a, b) => Number(a) - Number(b)));
  });

  it('the 413 K / 443 K reaction leads on to what consumes its products: the ethene reactions, and nothing consumes diethyl ether', () => {
    const group = groupsOf('rxn_ethanol-conc-h2so4');
    expect(ids(group.leads_on)).toEqual(['rxn_ethene-baeyers', 'rxn_ethene-hydration']);
  });

  it('same transformation, same named family and same reagent family', () => {
    expect(ids(groupsOf('rxn_propene-hbr').same_transformation)).toEqual(['rxn_propene-hbr-peroxide']);
    expect(ids(groupsOf('rxn_haloform-ethanol').same_named_family)).toEqual(['rxn_haloform-propanone']);
    expect(ids(groupsOf('rxn_alcohol1-to-aldehyde-pcc').same_transformation)).toEqual(['rxn_ethanol-to-ethanal-dichromate', 'rxn_ethanol-to-ethanal-pcc']);
    expect(groupsOf('rxn_ethanal-aldol').same_reagent_family?.total).toBeGreaterThan(12);
  });

  it('shares a mechanism is empty on the demo (each of its mechanisms is used by one reaction)', () => {
    for (const id of Object.keys(state.records.reaction)) expect(groupsOf(id).shares_mechanism?.total).toBe(0);
  });

  it('a group of more than 12 is complete in `items` (the view cuts the preview, not the data)', () => {
    const group = groupsOf('rxn_ethanal-aldol').same_reagent_family as RelatedGroup;
    expect(group.items.length).toBe(group.total);
  });

  it('two reactions that name the same mechanism share it (made here: the demo has none)', () => {
    const reactions = state.records.reaction as Record<string, Reaction>;
    const other = { ...(reactions['rxn_ethene-hydration'] as Reaction), mechanismIds: ['mec_aldol-ethanal'] } as Reaction;
    const changed = { ...state, records: { ...state.records, reaction: { ...reactions, [other.id]: other } } } as typeof state;
    const group = relatedReactionsOf(contextOf(changed).indexes, reactions['rxn_ethanal-aldol'] as Reaction).find((g) => g.key === 'shares_mechanism');
    expect(group?.items.map((i) => i.reactionId)).toEqual(['rxn_ethene-hydration']);
  });
});
