/**
 * Step 7.2a C1: the reactions that name a target as an outcome product (DIRECT references only, ADR-042), grouped by the carried
 * substrate (folded name, then ID), each with its outside flag; a reaction with no carried substrate is in its own last group.
 */
import { describe, expect, it } from 'vitest';
import { documentToState } from '@/core/dataset';
import { buildDemoDocument } from '@/test-support/demo';
import { chemClass, cl, contextOf, reaction, sp, species, stateOf } from '@/test-support/graph-state';
import type { AnyRecord } from '../../schema';
import { directPrecursors, NO_STARTING_MATERIAL } from './direct';

const make = (slug: string, from: string | undefined, to: string, extra: { toRole?: 'main' | 'coproduct' } = {}): AnyRecord =>
  reaction({
    slug,
    name: `Reaction ${slug}`,
    scope: 'specific',
    participants: from === undefined ? [] : [{ ref: sp(from), role: 'reactant' }],
    outcomes: [{ sel: 'major', products: [{ ref: sp(to), role: extra.toRole ?? 'main' }] }],
  });

const base = [species('alpha', 'Alpha'), species('beta', 'Beta'), species('gamma', 'Gamma'), species('target', 'Target')] as AnyRecord[];

describe('directPrecursors', () => {
  it('groups the reactions that make the target by their carried substrate: folded name, then ID; reactions by folded name', () => {
    const ctx = contextOf(stateOf(...base, make('b2', 'beta', 'target'), make('a1', 'alpha', 'target'), make('b1', 'beta', 'target'), make('g1', 'gamma', 'alpha')));
    const result = directPrecursors(ctx, sp('target'), () => 'unmapped');
    expect(result.groups.map((g) => g.name)).toEqual(['Alpha', 'Beta']);
    expect(result.groups[1]?.reactions.map((r) => r.name)).toEqual(['Reaction b1', 'Reaction b2']);
    expect(result.reactionCount).toBe(3);
  });

  it('a reaction with two outcomes that both make the target is listed once', () => {
    const twice = reaction({
      slug: 'twice',
      name: 'Twice',
      scope: 'specific',
      participants: [{ ref: sp('alpha'), role: 'reactant' }],
      outcomes: [
        { sel: 'major', products: [{ ref: sp('target') }] },
        { sel: 'minor', products: [{ ref: sp('target') }] },
      ],
    });
    const result = directPrecursors(contextOf(stateOf(...base, twice)), sp('target'), () => 'unmapped');
    expect(result.reactionCount).toBe(1);
    expect(result.groups[0]?.reactions).toHaveLength(1);
  });

  it('a reaction without a carried substrate is in the last group, "No starting material marked"', () => {
    const ctx = contextOf(stateOf(...base, make('none1', undefined, 'target'), make('a1', 'alpha', 'target')));
    const result = directPrecursors(ctx, sp('target'), () => 'unmapped');
    expect(result.groups.map((g) => g.name)).toEqual(['Alpha', NO_STARTING_MATERIAL]);
    expect(NO_STARTING_MATERIAL).toBe('No starting material marked');
    expect(result.groups[1]?.substrate).toBeNull();
  });

  it('marks a reaction outside the exam scope, and only that one', () => {
    const ctx = contextOf(stateOf(...base, make('a1', 'alpha', 'target'), make('a2', 'alpha', 'target')));
    const result = directPrecursors(ctx, sp('target'), (ref) => (ref.id === 'rxn_a2' ? 'outside' : 'official'));
    expect(result.groups[0]?.reactions.map((r) => [r.name, r.outside])).toEqual([['Reaction a1', false], ['Reaction a2', true]]);
  });

  it('a class target: only reactions that name the class itself; a reaction that makes a member is not listed', () => {
    const state = stateOf(chemClass('acids', 'Acids', 'compound_class'), species('member', 'Member', { classes: ['acids'] }), ...base, make('into-class', 'alpha', 'target'), make('into-member', 'beta', 'member'),
      reaction({ slug: 'to-class', name: 'To the class', scope: 'generic', participants: [{ ref: sp('alpha'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: cl('acids') }] }] }));
    const result = directPrecursors(contextOf(state), cl('acids'), () => 'unmapped');
    expect(result.groups.flatMap((g) => g.reactions.map((r) => r.name))).toEqual(['To the class']);
  });

  it('a target nothing makes, or that is not in the data, has no groups', () => {
    const ctx = contextOf(stateOf(...base, make('a1', 'alpha', 'target')));
    expect(directPrecursors(ctx, sp('gamma'), () => 'unmapped')).toMatchObject({ groups: [], reactionCount: 0 });
    expect(directPrecursors(ctx, sp('nothing'), () => 'unmapped')).toMatchObject({ groups: [], reactionCount: 0 });
  });

  it('the demo: the groups hold exactly the reactions the index says produce the target, each once', () => {
    const parsed = documentToState(buildDemoDocument());
    if (!parsed.ok) throw new Error('demo has duplicate IDs');
    const ctx = contextOf(parsed.state);
    for (const id of Object.keys(parsed.state.records.species)) {
      const expected = new Set(ctx.indexes.productionsOf({ kind: 'species', id }).map((p) => p.reactionId));
      const result = directPrecursors(ctx, { kind: 'species', id }, () => 'unmapped');
      const listed = result.groups.flatMap((g) => g.reactions.map((r) => r.reactionId));
      expect(listed.length, id).toBe(new Set(listed).size);
      expect(new Set(listed), id).toEqual(expected);
    }
  });
});
