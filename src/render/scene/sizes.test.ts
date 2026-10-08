/**
 * The taller box (step 5.5a part 2, item j; 5.4b review decision 6 (2)): a species or member node with a depiction key has a structure
 * area of 128 x 80 above its name line, fixed at size time (so the same at every LOD); the formula line gives way; a node without a
 * key keeps its box; no other box kind has one.
 */
import { describe, expect, it } from 'vitest';
import { fakeMeasurer, node, nobodyPorts, projectionOf } from '@/test-support/scene-kit';
import { BOXES, nodeSizes, STRUCTURE_AREA, STRUCTURE_GAP, type ScenePorts } from '.';

const species = node('spc_a', { kind: 'species', record: { kind: 'species', id: 'spc_a' }, role: 'focus' });
const member = node('spc_m', { kind: 'species', record: { kind: 'species', id: 'spc_m' }, role: 'member' });
const reagent = node('rgt_r', { kind: 'reagent', record: { kind: 'reagent', id: 'rgt_r' }, role: 'focus' });
const hub = node('cls_h');
const projection = projectionOf({ nodes: [species, member, reagent, hub] });
const describe_: ScenePorts['describe'] = (ref) => ({ name: `Name of ${ref.id}`, formula: 'C2H6O' });
const plain: ScenePorts = { ...nobodyPorts, describe: describe_ };
const keyed: ScenePorts = { ...plain, depictionKeyOf: (ref) => (ref.kind === 'species' ? `key:${ref.id}` : undefined) };

describe('nodeSizes with a structure area', () => {
  const without = nodeSizes(projection, plain, fakeMeasurer);
  const withKeys = nodeSizes(projection, keyed, fakeMeasurer);

  it('a species and a member with a key are taller by the structure area, and wide enough for it', () => {
    for (const id of ['spc_a', 'spc_m']) {
      const box = withKeys.get(id) as { width: number; height: number };
      const spec = BOXES[id === 'spc_a' ? 'species' : 'member'];
      expect(box.height).toBeGreaterThanOrEqual(STRUCTURE_AREA.height + STRUCTURE_GAP + 2 * spec.padY);
      expect(box.height).toBeGreaterThan((without.get(id) as { height: number }).height);
      expect(box.width).toBeGreaterThanOrEqual(STRUCTURE_AREA.width + 2 * spec.padX);
      expect(box.width % 4).toBe(0);
      expect(box.height % 4).toBe(0);
    }
  });

  it('the formula line gives way: the height is the area, the gap, the name line and the padding', () => {
    const spec = BOXES.species;
    const name = fakeMeasurer([{ text: 'Name of spc_a' }], spec.label);
    const expected = Math.ceil((STRUCTURE_AREA.height + STRUCTURE_GAP + name.height + 2 * spec.padY) / 4) * 4;
    expect(withKeys.get('spc_a')?.height).toBe(expected);
  });

  it('a node without a key, a reagent and a hub keep their boxes', () => {
    for (const id of ['rgt_r', 'cls_h']) expect(withKeys.get(id)).toEqual(without.get(id));
    const unkeyed = nodeSizes(projection, { ...keyed, depictionKeyOf: () => undefined }, fakeMeasurer);
    expect(unkeyed.get('spc_a')).toEqual(without.get('spc_a'));
  });

  it('is fixed at size time: sizes take no LOD, and the same projection gives the same boxes', () => {
    expect(nodeSizes(projection, keyed, fakeMeasurer)).toEqual(withKeys);
    expect(nodeSizes.length).toBe(3);
  });

  it('a very long name stays within the maximum width of its box kind', () => {
    const long: ScenePorts = { ...keyed, describe: () => ({ name: 'x'.repeat(500) }) };
    expect(nodeSizes(projection, long, fakeMeasurer).get('spc_a')?.width).toBeLessThanOrEqual(BOXES.species.maxWidth);
  });
});
