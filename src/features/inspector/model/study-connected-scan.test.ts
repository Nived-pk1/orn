/** No silent cut (step C7): a class with more compounds than the scan limit says so on the group that was built from the scanned part. */
import { describe, expect, it } from 'vitest';
import { contextOf, chemClass, cl, reaction, sp, species, stateOf } from '@/test-support/graph-state';
import type { AnyRecord } from '@/core/schema';
import { connectedOf, MAX_SCANNED } from './study-connected';

const world = (members: number) => {
  const records: AnyRecord[] = [chemClass('big', 'Big class', 'functional_group'), species('target', 'Target')];
  for (let i = 0; i < members; i += 1) records.push(species(`m${i}`, `M${i}`, { classes: ['big'] }));
  records.push(reaction({ slug: 'uses-class', name: 'Uses the class', scope: 'generic', participants: [{ ref: cl('big'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('target') }] }] }));
  const ctx = contextOf(stateOf(...records));
  return { state: ctx.state, indexes: ctx.indexes };
};

describe('connectedOf for a class: the scan limit is said', () => {
  it('more compounds than the limit: the "uses" group says "first 5,000 of N compounds"', () => {
    const groups = connectedOf(world(MAX_SCANNED + 120), { kind: 'class', id: 'cls_big' });
    expect(groups.find((g) => g.key === 'uses')?.note).toBe(`first ${MAX_SCANNED.toLocaleString('en-US')} of ${(MAX_SCANNED + 120).toLocaleString('en-US')} compounds`);
  });
  it('within the limit: no note', () => {
    const groups = connectedOf(world(30), { kind: 'class', id: 'cls_big' });
    expect(groups.find((g) => g.key === 'uses')?.note).toBeUndefined();
  });
});
