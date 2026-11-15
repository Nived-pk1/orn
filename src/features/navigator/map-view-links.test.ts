/**
 * A busy SELECTED family shows its links (step 8.4m, M3), over the full-content fixture: a hover keeps the 15-line rule; a selected
 * family draws up to 30 lines, one per neighbour family and direction, and fades the rest; above 30 the old rule stands.
 */
import { describe, expect, it } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { documentToState } from '@/core/dataset';
import type { Scene } from '@/render/scene';
import { navigatorRig } from '@/test-support/navigator-kit';
import { BUSY_FAMILY, CROWDED_FAMILY, fullMap, QUIET_FAMILY } from '../../../tests/fixtures/full-map/full-map';
import { BUSY_ARROWS, BUSY_SELECTED_LINES } from './busy-rule';
import { mapHintOf } from './map-hint-line';
import { mapView } from './map-view';
import { createNavigatorModel } from './pipeline';

const parsed = documentToState(fullMap().document as never);
if (!parsed.ok) throw new Error('fixture');

async function sceneOf(): Promise<{ scene: Scene; pairs: () => readonly { readonly from: string; readonly to: string; readonly candidates: readonly { readonly reactionId: string }[] }[] }> {
  const rig = navigatorRig(createCanonicalStore({ initial: parsed.ok ? parsed.state : (undefined as never), validateInitial: false }));
  const model = createNavigatorModel(rig.ports);
  model.start();
  for (let i = 0; i < 3; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const scene = model.getState().scene;
  model.stop();
  if (scene === null) throw new Error('no scene');
  return { scene, pairs: () => rig.ports.indexes.current().navigatorRollup().pairs() };
}
const base = { chapter: false, showUnclassified: false } as const;

describe('a busy selected family shows its links (8.4m, M3)', () => {
  it('the limits: a hover 15, a selected family 30', () => {
    expect(BUSY_ARROWS).toBe(15);
    expect(BUSY_SELECTED_LINES).toBe(30);
  });

  it('hovered (not selected): the old rule, no line and the neighbours outlined', async () => {
    const { scene } = await sceneOf();
    const view = mapView(scene, { ...base, focusId: BUSY_FAMILY });
    expect(view.busy).toBe(18);
    expect(view.scene.edges).toHaveLength(0);
    expect(view.marks.outlined?.size).toBe(14);
    expect(view.links).toBeUndefined();
  });

  it('selected: its 18 lines are drawn, one per neighbour and direction, the families it has no line with fade, the bar counts reactions and families', async () => {
    const { scene, pairs } = await sceneOf();
    const view = mapView(scene, { ...base, focusId: BUSY_FAMILY, locked: true });
    expect(view.busy).toBe(0);
    expect(view.scene.edges).toHaveLength(18);
    expect(new Set(view.scene.edges.map((edge) => `${edge.from}>${edge.to}`)).size).toBe(18);
    expect(view.marks.outlined).toBeUndefined();
    expect([...view.marks.faded].sort()).toEqual(['cls_family-11', QUIET_FAMILY]);
    expect(view.links?.families).toBe(14);
    const line = mapHintOf(view, pairs);
    expect(line.kind).toBe('links');
    expect(line.text).toMatch(/^\d+ reactions to 14 families$/);
    const wanted = new Set(view.links?.lines.map((one) => `${one.from}>${one.to}`));
    const reactions = new Set(pairs().filter((pair) => wanted.has(`${pair.from}>${pair.to}`)).flatMap((pair) => pair.candidates.map((c) => c.reactionId)));
    expect(line.text).toBe(`${reactions.size} reactions to 14 families`);
  });

  it('selected with the bucket shown: the two bucket lines are drawn too but are not counted as families', async () => {
    const { scene } = await sceneOf();
    const view = mapView(scene, { ...base, showUnclassified: true, focusId: BUSY_FAMILY, locked: true });
    expect(view.scene.edges).toHaveLength(20);
    expect(view.links?.lines).toHaveLength(18);
    expect(view.links?.families).toBe(14);
  });

  it('more than 30 lines: the old rule (no line, outlines), and the bar points to the panel list', async () => {
    const { scene, pairs } = await sceneOf();
    const view = mapView(scene, { ...base, focusId: CROWDED_FAMILY, locked: true });
    expect(view.busy).toBe(32);
    expect(view.scene.edges).toHaveLength(0);
    expect(view.marks.outlined?.size).toBe(16);
    const line = mapHintOf(view, pairs);
    expect(line.kind).toBe('busy');
    expect(line.text).toMatch(/^\d+ reactions to 16 families: listed in the panel$/);
  });

  it('a selected family with few lines says nothing extra; a hover over a busy one never promises the panel', async () => {
    const { scene, pairs } = await sceneOf();
    expect(mapHintOf(mapView(scene, { ...base, focusId: QUIET_FAMILY, locked: true }), pairs).text).toBeUndefined();
    expect(mapHintOf(mapView(scene, { ...base, focusId: CROWDED_FAMILY }), pairs).text).not.toContain('panel');
  });
});
