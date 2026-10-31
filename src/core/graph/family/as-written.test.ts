/**
 * "As written in this reaction" (step 7.3b A5): a class participant or product that has `originalText` is drawn in its box with that text
 * (the card carries it as `substrateWrittenAs` / `writtenAs`); the class name stays the name; a species is unchanged.
 */
import { describe, expect, it } from 'vitest';
import { fullEquationsOfReaction, reactionCard, type FamilyCard } from '..';
import { demoState } from '@/test-support/app-boot-kit';
import { contextOf } from '@/test-support/graph-state';
import { withRecords } from '@/test-support/search-state';
import type { Reaction } from '../../schema';

const ID = 'rxn_alcohol1-to-aldehyde-pcc';
const base = demoState();
const reaction = base.records.reaction[ID as keyof typeof base.records.reaction] as Reaction;

const written = (substrate: string | undefined, product: string | undefined): Reaction => ({
  ...reaction,
  participants: reaction.participants.map((p) => (p.ref.kind === 'class' && substrate !== undefined ? { ...p, originalText: substrate } : p)),
  outcomes: reaction.outcomes.map((o) => ({ ...o, products: o.products.map((p) => (p.ref.kind === 'class' && product !== undefined ? { ...p, originalText: product } : p)) })),
});

describe('class boxes show the text as written (A5)', () => {
  it('the card carries the substrate and product text as written, nothing when none is stored', () => {
    const plain = reactionCard(contextOf(base), ID) as FamilyCard;
    expect(plain.substrateWrittenAs).toBeUndefined();
    expect(plain.groups[0]?.outcomes[0]?.products[0]?.writtenAs).toBeUndefined();
    const state = withRecords(base, [written('R–CH₂OH', 'R–CHO')]);
    const card = reactionCard(contextOf(state), ID) as FamilyCard;
    expect(card.substrateWrittenAs).toBe('R–CH₂OH');
    expect(card.groups[0]?.outcomes[0]?.products[0]?.writtenAs).toBe('R–CHO');
  });

  it('the full equation draws the class term as its text, keeps the class name, and drops the generic structure', () => {
    const state = withRecords(base, [written('R–CH₂OH', 'R–CHO')]);
    const context = contextOf(state);
    const [equation] = fullEquationsOfReaction(context.state, context.indexes, state.records.reaction[ID as keyof typeof state.records.reaction] as Reaction);
    const [reactant] = equation?.reactants ?? [];
    expect(reactant?.substance.kind).toBe('class');
    expect(reactant?.substance.formula).toBe('R–CH₂OH');
    expect(reactant?.substance.structure).toBeUndefined();
    expect(reactant?.name).not.toBe('R–CH₂OH');
    expect(equation?.products[0]?.substance.formula).toBe('R–CHO');
  });

  it('a species keeps its structure and its written name (unchanged)', () => {
    const species = (Object.values(base.records.reaction) as Reaction[]).find((r) => r.participants.every((p) => p.ref.kind === 'species'));
    expect(species).toBeDefined();
    const touched = { ...(species as Reaction), participants: (species as Reaction).participants.map((p) => ({ ...p, originalText: 'xyz' })) };
    const state = withRecords(base, [touched]);
    const context = contextOf(state);
    const [equation] = fullEquationsOfReaction(context.state, context.indexes, touched);
    expect(equation?.reactants[0]?.name).toBe('xyz');
    expect(equation?.reactants[0]?.substance.kind).toBe('species');
  });
});
