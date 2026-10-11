/** Exam scope of a family (step 5.8): outside only when it has reactions and every one is outside; the overview dims by it. */
import { describe, expect, it } from 'vitest';
import { demoState } from '@/test-support/app-boot-kit';
import { contextOf, requestOf, type ScopeOf } from '@/test-support/graph-state';
import { navigatorProjection } from '.';
import { familyOutside } from './family-scope';

const state = demoState();
const ctx = (scopeOf: ScopeOf) => contextOf(state, 1, scopeOf);
const hubs = ctx(() => 'unmapped').indexes.navigatorRollup().hubs;

describe('familyOutside', () => {
  it('is false when no scope is chosen (everything unmapped)', () => {
    expect(hubs.some((hub) => familyOutside(ctx(() => 'unmapped'), hub.id))).toBe(false);
  });

  it('is true for a family whose every reaction is outside, false when one is not', () => {
    const rollup = ctx(() => 'unmapped').indexes.navigatorRollup();
    const busy = hubs.find((hub) => rollup.candidatesFrom(hub.id).length > 0) as (typeof hubs)[number];
    const first = rollup.candidatesFrom(busy.id)[0]?.reactionId as string;
    const allOutside: ScopeOf = () => 'outside';
    expect(familyOutside(ctx(allOutside), busy.id)).toBe(true);
    const oneOfficial: ScopeOf = (ref) => (ref.id === first ? 'official' : 'outside');
    expect(familyOutside(ctx(oneOfficial), busy.id)).toBe(false);
  });

  it('a family with no reaction is never outside', () => {
    const rollup = ctx(() => 'unmapped').indexes.navigatorRollup();
    const quiet = hubs.filter((hub) => rollup.candidatesFrom(hub.id).length === 0 && rollup.candidatesTo(hub.id).length === 0);
    for (const hub of quiet) expect(familyOutside(ctx(() => 'outside'), hub.id)).toBe(false);
  });
});

describe('the overview flags a family by its reactions, and hides nothing', () => {
  it('under "everything outside" every drawn family with reactions is flagged and the default request is unfiltered', () => {
    const plain = navigatorProjection.build(ctx(() => 'unmapped'), requestOf('navigator', {}));
    const dimmed = navigatorProjection.build(ctx(() => 'outside'), requestOf('navigator', {}));
    expect(dimmed.nodes.map((n) => n.id)).toEqual(plain.nodes.map((n) => n.id));
    expect(dimmed.edges.length).toBe(plain.edges.length);
    const flagged = dimmed.nodes.filter((n) => n.role === 'anchor' && n.flags.includes('outside_scope'));
    expect(flagged.length).toBeGreaterThan(0);
    expect(plain.nodes.some((n) => n.flags.includes('outside_scope'))).toBe(false);
  });
});
