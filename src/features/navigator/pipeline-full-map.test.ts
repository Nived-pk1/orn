/**
 * The whole map is drawn (step 8.4m, M2): the anchored overview is laid out by the grid (fixed cells), so its pair limit is "every pair of
 * the shown boxes", not the 120 the layered (ELK) path keeps. Over a generated dataset the size of the owner's full content
 * (tests/fixtures/full-map): no pair is cut, nothing is reported as not drawn, and no family loses a line of its own.
 */
import { describe, expect, it } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { documentToState } from '@/core/dataset';
import { navigatorRig } from '@/test-support/navigator-kit';
import { BUSY_FAMILY, CROWDED_FAMILY, FULL_MAP_FAMILIES, FULL_MAP_REACTIONS, fullMap } from '../../../tests/fixtures/full-map/full-map';
import { NAVIGATOR_MAX_EDGES } from './limits';
import { createNavigatorModel, type NavigatorModelOptions } from './pipeline';

const built = fullMap();
const parsed = documentToState(built.document as never);
if (!parsed.ok) throw new Error('the full-map fixture does not parse');

const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

async function started(options: NavigatorModelOptions = {}) {
  const store = createCanonicalStore({ initial: parsed.ok ? parsed.state : (undefined as never), validateInitial: false });
  const rig = navigatorRig(store);
  const model = createNavigatorModel(rig.ports, options);
  model.start();
  await settle();
  await settle();
  return { rig, model, store };
}

const pairsOf = (store: Awaited<ReturnType<typeof started>>['rig']) => store.ports.indexes.current().navigatorRollup().pairs();

describe('the whole map is drawn (8.4m, M2)', () => {
  it('the fixture is the size of the full content: 17 families, 650 reactions, more ordered pairs than the old limit', async () => {
    const { rig, model } = await started();
    const pairs = pairsOf(rig);
    expect(Object.keys(rig.ports.store.getState().records.reaction)).toHaveLength(FULL_MAP_REACTIONS);
    expect(model.getState().scene?.nodes.filter((node) => node.box === 'hub')).toHaveLength(FULL_MAP_FAMILIES);
    expect(pairs.length).toBe(built.facts.between + built.facts.loops + built.facts.bucket);
    expect(pairs.length).toBeGreaterThan(NAVIGATOR_MAX_EDGES);
    model.stop();
  });

  it('the grid overview admits every pair: no truncation, one line per ordered pair', async () => {
    const { rig, model } = await started();
    const scene = model.getState().scene;
    expect(model.getState().layout).toBe('grid');
    expect(scene?.truncation ?? null).toBeNull();
    const drawn = new Set(scene?.edges.map((edge) => `${edge.from}>${edge.to}`));
    for (const pair of pairsOf(rig)) expect(drawn.has(`${pair.from}>${pair.to}`), `${pair.from}>${pair.to}`).toBe(true);
    for (const node of scene?.nodes ?? []) expect(node.badges.some((badge) => badge.kind === 'hidden_neighbours'), node.id).toBe(false);
    model.stop();
  });

  it('a family never loses a line of its own: every pair of the busy and of the crowded family is in the Scene with its full count', async () => {
    const { rig, model } = await started();
    const scene = model.getState().scene;
    for (const family of [BUSY_FAMILY, CROWDED_FAMILY]) {
      const own = pairsOf(rig).filter((pair) => pair.from === family || pair.to === family);
      expect(own.length).toBeGreaterThan(15);
      for (const pair of own) {
        const edge = scene?.edges.find((one) => one.from === pair.from && one.to === pair.to);
        expect(edge, `${pair.from}>${pair.to}`).toBeDefined();
        expect(edge?.bundleSize ?? 1, `${pair.from}>${pair.to}`).toBe(pair.candidates.length);
      }
    }
    model.stop();
  });

  it('the bound is the boxes squared, and the projection is built at most twice for it', async () => {
    const { rig, model } = await started();
    const boxes = model.getState().scene?.nodes.length ?? 0;
    expect(pairsOf(rig).length).toBeLessThanOrEqual(boxes * boxes);
    expect(model.stats().projections).toBeLessThanOrEqual(2);
    model.stop();
  });

  it('the layered (ELK) path keeps its limit of 120 pairs and says what it cut', async () => {
    const { rig, model } = await started({ layoutAlgorithm: 'layered' });
    const truncation = model.getState().scene?.truncation;
    expect(truncation?.reason).toBe('max_edges');
    expect(truncation?.hiddenPairs).toBe(pairsOf(rig).length - NAVIGATOR_MAX_EDGES);
    model.stop();
  });
});
