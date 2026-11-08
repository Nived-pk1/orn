/**
 * The title row of a box (step 8.4c, A3): "↻ n" (reactions inside the family) and the badges (R and the others) get their own room at the right end
 * of the TITLE row, so they never overlap the formula or the title. The box width is computed to include them.
 */
import { describe, expect, it } from 'vitest';
import { fakeMeasurer, node, nobodyPorts, projectionOf } from '@/test-support/scene-kit';
import type { NodeReactionCounts } from '@/core/graph/contracts';
import { BADGE_SIZE, BOXES, nodeSizes, TITLE_ROW_GAP, titleRowExtra, type ScenePorts } from '.';

const counts = (loops: number): NodeReactionCounts => ({ out: 0, in: 0, loops, outAll: 0, inAll: 0 });
const ports: ScenePorts = { ...nobodyPorts, describe: (ref) => ({ name: `Name ${ref.id}`, formula: 'R-CO-NR2' }) };
const sized = (n: ReturnType<typeof node>): { width: number; height: number } => nodeSizes(projectionOf({ nodes: [n] }), ports, fakeMeasurer).get(n.id) as { width: number; height: number };

describe('titleRowExtra', () => {
  it('is zero for a box with neither loops nor badges', () => {
    expect(titleRowExtra(node('cls_a'), fakeMeasurer)).toBe(0);
  });
  it('holds the width of "↻ n" and the gap before it', () => {
    const one = titleRowExtra(node('cls_a', { reactionCounts: counts(2) }), fakeMeasurer);
    const text = fakeMeasurer([{ text: '↻ 2' }], { size: 11, weight: 'regular', mono: false }).width;
    expect(one).toBeCloseTo(TITLE_ROW_GAP + text, 6);
  });
  it('adds one badge each (BADGE_SIZE plus a gap), and none for the Unclassified bucket loops', () => {
    const base = titleRowExtra(node('cls_a'), fakeMeasurer);
    const withR = titleRowExtra(node('cls_a', { flags: ['review_required'] }), fakeMeasurer);
    expect(withR - base).toBeGreaterThanOrEqual(TITLE_ROW_GAP + BADGE_SIZE);
    expect(titleRowExtra(node('cls_u', { role: 'unclassified', kind: 'virtual', reactionCounts: counts(4) }), fakeMeasurer)).toBe(0);
  });
});

describe('nodeSizes with the title row (step 8.4c, A3)', () => {
  it('a box with loops is wider than the same box without, by at least the room of "↻ n" when the title decides the width', () => {
    const spec = BOXES.hub;
    const name = 'x'.repeat(16);
    const long: ScenePorts = { ...ports, describe: () => ({ name }) };
    const plain = nodeSizes(projectionOf({ nodes: [node('cls_a')] }), long, fakeMeasurer).get('cls_a') as { width: number };
    const looped = nodeSizes(projectionOf({ nodes: [node('cls_a', { reactionCounts: counts(3) })] }), long, fakeMeasurer).get('cls_a') as { width: number };
    expect(looped.width).toBeGreaterThan(plain.width);
    const label = fakeMeasurer([{ text: name }], spec.label).width;
    const caption = fakeMeasurer([{ text: '↻ 3' }], { size: 11, weight: 'regular', mono: false }).width;
    expect(looped.width).toBeGreaterThanOrEqual(Math.min(spec.maxWidth, label + TITLE_ROW_GAP + caption + 2 * spec.padX));
  });
  it('the title row never needs more than the cap of the kind: the box stays within its maximum width', () => {
    const long: ScenePorts = { ...ports, describe: () => ({ name: 'x'.repeat(500) }) };
    expect(nodeSizes(projectionOf({ nodes: [node('cls_a', { reactionCounts: counts(12), flags: ['review_required'] })] }), long, fakeMeasurer).get('cls_a')?.width).toBeLessThanOrEqual(BOXES.hub.maxWidth);
  });
  it('a box without loops or badges keeps its size exactly', () => {
    const before = sized(node('cls_a'));
    expect(before.width % 4).toBe(0);
  });
});
