/** The duplicate check of concepts, named reactions and transformations (step 6.6b, decisions N1-N3): by name and aliases, folded. */
import { describe, expect, it } from 'vitest';
import { indexEngine } from '@/core/indexes';
import type { Concept, NamedReaction } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { knowledgeDuplicates, MAX_KNOWLEDGE_MATCHES } from './knowledge-duplicates';

const state = demoState();
const indexes = indexEngine.build(state);
const cannizzaro = state.records.named_reaction['nrx_cannizzaro' as never] as NamedReaction;

describe('knowledgeDuplicates', () => {
  it('finds a named reaction with the same name (case and spacing folded), once, with the reason', () => {
    const draft = { ...cannizzaro, id: 'nrx_new', name: '  CANNIZZARO   reaction ', aliases: [] };
    const found = knowledgeDuplicates(state, indexes, 'named_reaction', draft as never);
    expect(found.matches).toEqual([{ ref: { kind: 'named_reaction', id: 'nrx_cannizzaro' }, name: 'Cannizzaro reaction', reasons: ['name'] }]);
    expect(found.more).toBe(0);
  });
  it('an alias of the draft that is a name or alias of another record counts', () => {
    const draft = { ...cannizzaro, id: 'nrx_new', name: 'Something else', aliases: ['Cannizzaro'] };
    expect(knowledgeDuplicates(state, indexes, 'named_reaction', draft as never).matches.map((m) => m.ref.id)).toEqual(['nrx_cannizzaro']);
  });
  it('never matches the record itself, a different kind, or a different name', () => {
    expect(knowledgeDuplicates(state, indexes, 'named_reaction', cannizzaro).matches).toEqual([]);
    const concept = Object.values(state.records.concept)[0] as Concept;
    expect(knowledgeDuplicates(state, indexes, 'transformation', { ...cannizzaro, id: 'trf_new', name: concept.name } as never).matches).toEqual([]);
    expect(knowledgeDuplicates(state, indexes, 'concept', { ...concept, id: 'cpt_new', name: 'Zz nothing like it', aliases: [] } as never).matches).toEqual([]);
  });
  it('a concept match carries its kind in words; matches are in ID order and bounded', () => {
    const concept = Object.values(state.records.concept).find((c) => c.conceptKind === 'reaction_type') as Concept;
    const found = knowledgeDuplicates(state, indexes, 'concept', { ...concept, id: 'cpt_new' } as never);
    expect(found.matches[0]).toMatchObject({ ref: { kind: 'concept', id: concept?.id }, qualifier: 'reaction type' });
    expect(found.matches.length).toBeLessThanOrEqual(MAX_KNOWLEDGE_MATCHES);
  });
});
