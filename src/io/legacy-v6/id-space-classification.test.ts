/**
 * Step 3.11b: the three ID rows added to docs/MIGRATION.md §4.2 (mechanism, topic mapping, transformation) and the registration of
 * transformation keys. Every ID is tested against the schema's ID pattern of its kind.
 */
import { describe, expect, it } from 'vitest';
import { hash64 } from '@/core/hash';
import { MechanismIdSchema, TopicMappingIdSchema, TransformationIdSchema } from '@/core/schema';
import { createDocumentIds } from './id-collect';
import { createLegacyIdSpace, transformationKey } from './id-space';

const h6 = (text: string): string => hash64(text).slice(0, 6);

describe('mechanism and topic mapping IDs (one per reaction)', () => {
  const space = createLegacyIdSpace({ reactionIds: ['r16', 'R 1'] });

  it('mec_v6-<reaction part> and tmp_v6-<reaction part>', () => {
    expect(space.mechanismId('r16')).toBe('mec_v6-r16');
    expect(space.topicMappingId('r16')).toBe('tmp_v6-r16');
    expect(space.mechanismId('R 1')).toBe(`mec_v6-r-1-${h6('R 1')}`);
    expect(space.topicMappingId('R 1')).toBe(`tmp_v6-r-1-${h6('R 1')}`);
    for (const id of ['r16', 'R 1']) {
      expect(MechanismIdSchema.safeParse(space.mechanismId(id)).success).toBe(true);
      expect(TopicMappingIdSchema.safeParse(space.topicMappingId(id)).success).toBe(true);
    }
  });

  it('asking for an unregistered reaction is a programmer error (it could not have been checked for collisions)', () => {
    expect(() => space.mechanismId('nope')).toThrow(/not registered/);
    expect(() => space.topicMappingId('nope')).toThrow(/not registered/);
  });
});

describe('transformation IDs: trf_v6-<slug>-<hash6> of the sorted, de-duplicated functional-group ids', () => {
  const key = (from: string[], to: string[]) => transformationKey(from, to);
  const space = createLegacyIdSpace({ transformations: [key(['alkene'], ['alcohol']), key(['alcohol'], ['alkene']), key(['a', 'b'], []), key([], ['x y'])] });

  it('the key is the sorted, de-duplicated ids on each side (injective, so nothing is merged by accident)', () => {
    expect(key(['b', 'a', 'a'], ['z'])).toBe('[["a","b"],["z"]]');
    expect(key(['a'], ['b'])).not.toBe(key(['b'], ['a']));
    expect(key(['a,b'], [])).not.toBe(key(['a', 'b'], []));
  });

  it('readable slug + hash of the key; order and repeats do not change the ID', () => {
    const id = space.transformationId(['alkene'], ['alcohol']);
    expect(id).toBe(`trf_v6-alkene-alcohol-${h6(key(['alkene'], ['alcohol']))}`);
    expect(space.transformationId(['b', 'a', 'a'], [])).toBe(space.transformationId(['a', 'b'], []));
    expect(space.transformationId(['alkene'], ['alcohol'])).not.toBe(space.transformationId(['alcohol'], ['alkene'])); // direction matters
  });

  it('every ID passes the schema pattern, also for odd characters', () => {
    for (const [from, to] of [[['alkene'], ['alcohol']], [['a', 'b'], []], [[], ['x y']]] as const) expect(TransformationIdSchema.safeParse(space.transformationId(from, to)).success).toBe(true);
    const odd = createLegacyIdSpace({ transformations: [key(['Ünï cödé ✓'.repeat(20)], ['\u0000'])] });
    expect(TransformationIdSchema.safeParse(odd.transformationId(['Ünï cödé ✓'.repeat(20)], ['\u0000'])).success).toBe(true);
  });

  it('an unregistered key is a programmer error', () => {
    expect(() => space.transformationId(['unknown'], [])).toThrow(/not registered/);
  });
});

describe('createDocumentIds registers the functional-group sets of every reaction', () => {
  const doc = {
    compounds: [{ id: 'c1', name: 'A' }],
    reactions: [
      { id: 'r1', transformation: { fgFrom: ['alkene'], fgTo: ['alcohol', 'alcohol'] } },
      { id: 'r2', transformation: { fgFrom: [], fgTo: [] } },
      { id: 'r3', transformation: { fgFrom: ['x', '', '  '], fgTo: 'not a list' } },
      { id: 'r4' },
      { id: 'r5', transformation: 'a string' },
    ],
  };

  it('a set with at least one group gets an ID; the same sets on another reaction share it', () => {
    const { ids } = createDocumentIds(doc);
    expect(TransformationIdSchema.safeParse(ids.transformationId(['alkene'], ['alcohol'])).success).toBe(true);
    expect(ids.transformationId(['alkene'], ['alcohol', 'alcohol'])).toBe(ids.transformationId(['alkene'], ['alcohol']));
    expect(TransformationIdSchema.safeParse(ids.transformationId(['x'], [])).success).toBe(true); // blank entries and a non-list are not part of the key
  });

  it('empty sets, missing and non-object transformations register nothing', () => {
    const { ids } = createDocumentIds(doc);
    expect(() => ids.transformationId([], [])).toThrow(/not registered/);
  });
});
