/**
 * The layout of the demo overview against the REAL layout worker code in process (step 5.5a part 2 item k, changed in 5.5b).
 *
 * What is measured, said as it is: the first shown layout is already the second answer (the pipeline asks once more with the first
 * result as previous positions). With arrow text (before 5.5b) a layout of the same graph given the shown one as previous was the same
 * layout; on the calm overview (no arrow text, ADR-037) it settles within a few asks. The 5.5a test that expanded each hub in turn and
 * compared layers is REMOVED with the expansion it measured: the overview no longer expands, the 5.5a carry item (b) "expansion
 * stability" is closed (docs/PROGRESS.md, "Step 5.5a review and navigator redesign").
 */
import { describe, expect, it } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { createNavigatorModel, type NavigatorModel } from '@/features/navigator/pipeline';
import { createElkEngine, loadElk } from '@/layout';
import type { LayoutRequest } from '@/layout/contracts';
import type { Scene } from '@/render/scene';
import { unarrangedDemoState } from '@/test-support/app-boot-kit';
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

describe('the demo overview, real ELK in process', () => {
  async function fresh() {
    // an overview with no cells (the arranged demo is drawn by the grid layout, not by ELK: step 5.5c)
    const store = createCanonicalStore({ initial: unarrangedDemoState(), validateInitial: false });
    const rig = navigatorRig(store);
    (rig.ports.layout as { layout: unknown }).layout = async (_view: string, request: never) => {
      rig.layout.requests.push(request);
      return { ok: true, result: await handlers.layout(request, ctx), cached: false };
    };
    const model = createNavigatorModel(rig.ports);
    model.start();
    await idle(model);
    return { model, rig };
  }

  it('the layout settles: asking again with the shown positions as previous reaches a fixed layout within 4 asks', async () => {
    // Changed 2026-10-09 (step 5.5b, ADR-037): the overview has no arrow text, so only the count chips are labels, and the first shown
    // layout (the second answer) is no longer a fixed point of "ask again with it as previous" (it was with labels). Nothing asks again
    // on the overview now (no expansion); this bounds what a later relayout (an edit of the dataset) can do: it settles in a few asks.
    const { model, rig } = await fresh();
    expect(rig.layout.requests).toHaveLength(2);
    const shown = model.getState().scene as Scene;
    let previous: Record<string, { x: number; y: number }> = Object.fromEntries(shown.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    let settledAt = -1;
    for (let ask = 1; ask <= 4 && settledAt < 0; ask += 1) {
      const answer = await handlers.layout({ ...(rig.layout.requests[1] as never as LayoutRequest), previous }, ctx);
      const moved = shown.nodes.filter((n) => JSON.stringify(answer.positions[n.id]) !== JSON.stringify(previous[n.id])).length;
      if (moved === 0) settledAt = ask;
      previous = answer.positions as Record<string, { x: number; y: number }>;
    }
    expect(settledAt).toBeGreaterThan(0);
    model.stop();
  }, 60_000);
});
