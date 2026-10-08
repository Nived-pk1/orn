/**
 * Expansion against the REAL layout worker code in process (step 5.5a part 2, item k): the demo's navigator is laid out by ELK
 * (`createLayoutHandlers` over `createElkEngine`), each hub is expanded in turn, and the other hubs are compared before and after:
 * a hub's layer is its rank among the distinct x positions of the hubs, its order is its rank by y inside its layer.
 *
 * What is measured, said as it is (PROGRESS, step 5.5a part 2): the layout is NOT stable under expansion. The first layout has no
 * previous positions; a layout of the same graph with them (ELK's interactive crossing minimisation) already moves 5 of the 16
 * hubs sideways and 11 vertically, so the baseline below is the second layout. From it, expanding a hub that adds members moves
 * the layer of up to 12 other hubs (amines 12, haloalkanes 11, diazonium salts 7, alkenes 2; the other 11 hubs: none), and
 * the order of up to 4. What holds, and is asserted: expanding a hub that adds no node changes no other hub; collapsing returns every hub to its baseline layer and order (the coordinates themselves differ a little);
 * most expansions leave every other hub's layer alone.
 */
import { describe, expect, it } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { createNavigatorModel, type NavigatorModel } from '@/features/navigator/pipeline';
import { createElkEngine, loadElk } from '@/layout';
import type { Scene } from '@/render/scene';
import { demoState } from '@/test-support/app-boot-kit';
import { navigatorRig } from '@/test-support/navigator-kit';
import { createLayoutHandlers } from '@/workers/layout/handlers';

const clock = () => performance.now();
const make = await loadElk();
const handlers = createLayoutHandlers(createElkEngine({ make, clock }), clock);
const ctx = { signal: new AbortController().signal, progress: () => undefined };

async function idle(model: NavigatorModel): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  for (let i = 0; i < 600 && model.getState().working; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

interface Frame {
  readonly positions: ReadonlyMap<string, string>;
  readonly layerOf: ReadonlyMap<string, number>;
  readonly orderOf: ReadonlyMap<string, number>;
  readonly size: number;
}

function frameOf(scene: Scene, hubs: readonly string[]): Frame {
  const at = new Map(scene.nodes.map((n) => [n.id, n]));
  const xs = [...new Set(hubs.map((h) => Math.round(at.get(h)?.x ?? 0)))].sort((a, b) => a - b);
  const layerOf = new Map(hubs.map((h) => [h, xs.indexOf(Math.round(at.get(h)?.x ?? 0))] as const));
  const orderOf = new Map<string, number>();
  for (let layer = 0; layer < xs.length; layer += 1) {
    const inLayer = hubs.filter((h) => layerOf.get(h) === layer).sort((a, b) => (at.get(a)?.y ?? 0) - (at.get(b)?.y ?? 0));
    inLayer.forEach((h, i) => orderOf.set(h, i));
  }
  return { positions: new Map(scene.nodes.map((n) => [n.id, `${n.x},${n.y}`] as const)), layerOf, orderOf, size: scene.nodes.length };
}

describe('expanding each hub of the demo, real ELK in process', () => {
  it('collapse restores the layer and order of every hub; an expansion that adds no node moves no other hub; most leave every layer alone', async () => {
    const store = createCanonicalStore({ initial: demoState(), validateInitial: false });
    const rig = navigatorRig(store);
    (rig.ports.layout as { layout: unknown }).layout = async (_view: string, request: never) => {
      rig.layout.requests.push(request);
      return { ok: true, result: await handlers.layout(request, ctx), cached: false };
    };
    const model = createNavigatorModel(rig.ports);
    model.start();
    await idle(model);
    const hubs = model.getState().hubIds;
    expect(hubs).toHaveLength(16);
    const toggle = async (id: string): Promise<void> => {
      rig.ui.expansion.getState().toggle(id);
      await idle(model);
    };
    // The second layout (with previous positions) is the baseline; the first one differs from it (see the header).
    await toggle(hubs[0] as string);
    await toggle(hubs[0] as string);
    const base = frameOf(model.getState().scene as Scene, hubs);

    let leavingLayersAlone = 0;
    let addedNothing = 0;
    for (const hub of hubs) {
      await toggle(hub);
      const after = frameOf(model.getState().scene as Scene, hubs);
      const others = hubs.filter((h) => h !== hub);
      const layerChanged = others.filter((h) => after.layerOf.get(h) !== base.layerOf.get(h)).length;
      const orderChanged = others.filter((h) => after.layerOf.get(h) === base.layerOf.get(h) && after.orderOf.get(h) !== base.orderOf.get(h)).length;
      if (layerChanged === 0) leavingLayersAlone += 1;
      if (after.size === base.size) {
        addedNothing += 1;
        expect({ hub, layerChanged, orderChanged }).toEqual({ hub, layerChanged: 0, orderChanged: 0 });
      }
      await toggle(hub);
      const back = frameOf(model.getState().scene as Scene, hubs);
      expect({ hub, size: back.size, layers: [...back.layerOf], orders: [...back.orderOf] }).toEqual({ hub, size: base.size, layers: [...base.layerOf], orders: [...base.orderOf] });
    }
    expect(addedNothing).toBeGreaterThan(0);
    expect(leavingLayersAlone).toBeGreaterThanOrEqual(hubs.length / 2);
    model.stop();
  }, 120_000);
});
