/**
 * Expansion against the REAL layout worker code in process (step 5.5a: part 2 item k, re-measured after part 1 item b): the demo's
 * navigator is laid out by ELK (the layout worker handlers over the ELK engine), each hub is expanded in turn from a fresh model, and
 * the other hubs are compared with the FIRST SHOWN layout: a hub's layer is its rank among the distinct x positions of the hubs, its
 * order is its rank by y inside its layer.
 *
 * What is measured, said as it is: the first shown layout is already the second answer (the pipeline asks once more with the first
 * result as previous positions), so the first interaction does not move the view, and a layout of the same graph given the shown one
 * as previous is the same layout. Expanding a hub that adds members can still change the layer of other hubs, and a collapse restores
 * every layer and the node count but not always the order inside a layer. Asserted: an expansion that adds no node changes no other
 * hub; a collapse restores every hub's layer and the node count; at least 4 of the 16 expansions leave every other hub's layer alone
 * (6 measured; 11 of 15 before edge labels and orthogonal routing).
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { createNavigatorModel, type NavigatorModel } from '@/features/navigator/pipeline';
import { createElkEngine, loadElk } from '@/layout';
import type { LayoutRequest } from '@/layout/contracts';
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
  async function fresh() {
    const store = createCanonicalStore({ initial: demoState(), validateInitial: false });
    const rig = navigatorRig(store);
    (rig.ports.layout as { layout: unknown }).layout = async (_view: string, request: never) => {
      rig.layout.requests.push(request);
      return { ok: true, result: await handlers.layout(request, ctx), cached: false };
    };
    const model = createNavigatorModel(rig.ports);
    model.start();
    await idle(model);
    const toggle = async (id: string): Promise<void> => {
      rig.ui.expansion.getState().toggle(id);
      await idle(model);
    };
    return { model, toggle, rig };
  }

  it('the first shown layout is stable: the layout of the same graph given it as previous is the same', async () => {
    const { model, rig } = await fresh();
    expect(rig.layout.requests).toHaveLength(2);
    const shown = model.getState().scene as Scene;
    const again = await handlers.layout({ ...(rig.layout.requests[1] as never as LayoutRequest), previous: Object.fromEntries(shown.nodes.map((n) => [n.id, { x: n.x, y: n.y }])) }, ctx);
    for (const n of shown.nodes) expect(again.positions[n.id], n.id).toEqual({ x: n.x, y: n.y });
    model.stop();
  }, 60_000);

  it('an expansion that adds no node moves no other hub; a collapse restores every layer; some expansions leave every layer alone', async () => {
    const report: string[] = [];
    let leavingLayersAlone = 0;
    let addedNothing = 0;
    const hubs = (await fresh().then(async (f) => (f.model.stop(), f.model.getState().hubIds))) as readonly string[];
    expect(hubs).toHaveLength(16);
    for (const hub of hubs) {
      const { model, toggle } = await fresh();
      const base = frameOf(model.getState().scene as Scene, hubs);
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
      expect({ hub, size: back.size, layers: [...back.layerOf] }).toEqual({ hub, size: base.size, layers: [...base.layerOf] });
      const ordersBack = hubs.filter((h) => back.orderOf.get(h) !== base.orderOf.get(h)).length;
      report.push(`${hub}: adds ${after.size - base.size} nodes, layer of ${layerChanged} other hubs, order of ${orderChanged}; after collapse ${ordersBack} hubs in another place`);
      model.stop();
    }
    if (process.env.ORN_REPORT !== undefined) writeFileSync(process.env.ORN_REPORT, report.join(String.fromCharCode(10)));
    expect(addedNothing).toBeGreaterThan(0);
    // Measured 6 of 16 with edge labels and orthogonal routing (part 2 of the earlier session measured 11 of 15 without labels): the
    // label layers change the layering. A guard against it getting worse, not a goal (PROGRESS, REVIEW REQUIRED).
    expect(leavingLayersAlone).toBeGreaterThanOrEqual(4);
  }, 240_000);
});
