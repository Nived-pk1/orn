/**
 * The filter input is built once per state (step 7.1b C3, E10): two filter changes on one state build it once; a new state (a new indexes
 * revision) builds a new one; the answers are the same as without the memo.
 */
import { describe, expect, it, vi } from 'vitest';
import { demoState } from '@/test-support/app-boot-kit';
import { contextOf } from '@/test-support/graph-state';
import { buildReactionFilterInput, filterReactions, createReactionFilterMemo } from '.';

describe('createReactionFilterMemo', () => {
  const first = contextOf(demoState(), 1);
  const second = contextOf(demoState(), 2);

  it('builds the input ONCE for two filter changes on one state', () => {
    const build = vi.fn(buildReactionFilterInput);
    const memo = createReactionFilterMemo(build);
    const a = filterReactions(memo.inputFor(first), { typeIds: [] }, undefined);
    const b = filterReactions(memo.inputFor(first), { text: 'ethanol' }, undefined);
    expect(build).toHaveBeenCalledTimes(1);
    expect(a.total).toBe(b.total);
  });

  it('a new state (a new indexes revision) builds a new input', () => {
    const build = vi.fn(buildReactionFilterInput);
    const memo = createReactionFilterMemo(build);
    memo.inputFor(first);
    memo.inputFor(second);
    expect(build).toHaveBeenCalledTimes(2);
    memo.inputFor(second);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('the same revision but a different state object is a different state', () => {
    const build = vi.fn(buildReactionFilterInput);
    const memo = createReactionFilterMemo(build);
    memo.inputFor(first);
    memo.inputFor(contextOf(demoState(), 1));
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('gives the same answers as an input built directly', () => {
    const memo = createReactionFilterMemo();
    expect(filterReactions(memo.inputFor(first), {}, undefined)).toEqual(filterReactions(buildReactionFilterInput(first), {}, undefined));
  });
});
