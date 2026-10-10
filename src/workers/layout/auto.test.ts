/** The automatic arrangement through the layout handlers (fake ELK): cells come from the layered drawing and are noted; nothing is cached under another key. */
import { describe, expect, it } from 'vitest';
import { createElkEngine } from '@/layout/elk';
import { layoutCacheKey } from '@/layout/cache-key';
import type { LayoutRequest } from '@/layout/contracts';
import { request } from '@/test-support/layout-kit';
import { createFakeElk } from '@/test-support/layout-fakes';
import { createMemoryWorkers } from '@/test-support/rpc-memory-port';
import { createRpcClient, createRpcHost } from '@/workers/rpc';
import type { LayoutWorkerApi } from '@/workers/rpc/contracts';
import { createLayoutHandlers } from './handlers';
import { LAYOUT_SPECS } from './specs';

const clock = () => performance.now();

function rig(failElk = false) {
  const elk = createFakeElk();
  const make = failElk ? () => { throw new Error('boom'); } : elk.make;
  const workers = createMemoryWorkers((worker) => {
    void createRpcHost(worker.host, createLayoutHandlers(createElkEngine({ make, clock }), clock));
  });
  const client = createRpcClient<LayoutWorkerApi>({ factory: workers.factory, specs: LAYOUT_SPECS, options: {} });
  return { elk, client };
}

const grid = (over: Partial<LayoutRequest> & { nodes: LayoutRequest['nodes'] }): LayoutRequest => ({ ...request({ nodes: ['a'] }), algorithm: 'grid', ...over });

describe('automatic arrangement in the layout worker', () => {
  it('hubs without a cell are placed from the layered drawing, noted in words, under the key of the request that was asked', async () => {
    const { client, elk } = rig();
    const asked = grid({
      ...request({ nodes: ['a', 'b', 'c', 'u'], edges: [['a', 'b'], ['b', 'c']] }),
      algorithm: 'grid',
      nodes: request({ nodes: ['a', 'b', 'c', 'u'] }).nodes.map((n) => (n.id === 'u' ? n : { ...n, autoCell: true as const })),
    });
    const answer = await client.layout(asked);
    if (!answer.ok) throw new Error(answer.error.message);
    expect(answer.value.engine).toBe('grid');
    expect(answer.value.cacheKey).toBe(layoutCacheKey(asked));
    expect(answer.value.notes.some((n) => n.startsWith('automatic arrangement: 3 boxes have no cell'))).toBe(true);
    expect(elk.graphs).toHaveLength(1);
    // the fake ELK puts every box in one layer, so the three hubs share column 0 and take rows 0 to 2 in the order it drew them
    const at = (id: string) => answer.value.positions[id];
    expect(new Set(['a', 'b', 'c'].map((id) => at(id)?.x)).size).toBe(1);
    expect(new Set(['a', 'b', 'c'].map((id) => at(id)?.y)).size).toBe(3);
    expect(at('u')?.y ?? 0).toBeGreaterThan(Math.max(...['a', 'b', 'c'].map((id) => at(id)?.y ?? 0)));
    const again = await client.layout(asked);
    if (!again.ok) throw new Error(again.error.message);
    expect(again.value.positions).toEqual(answer.value.positions);
  });

  it('a request whose hubs all have cells (or none ask) never calls ELK and carries no automatic note', async () => {
    const { client, elk } = rig();
    const nodes = request({ nodes: ['a', 'b'] }).nodes.map((n, i) => ({ ...n, cell: { column: i, row: 0 } }));
    const answer = await client.layout(grid({ nodes }));
    if (!answer.ok) throw new Error(answer.error.message);
    expect(elk.graphs).toHaveLength(0);
    expect(answer.value.notes.some((n) => n.includes('automatic'))).toBe(false);
  });

  it('ELK that fails still arranges (the fallback layered drawing) and says so', async () => {
    const { client } = rig(true);
    const nodes = request({ nodes: ['a', 'b'], edges: [['a', 'b']] }).nodes.map((n) => ({ ...n, autoCell: true as const }));
    const answer = await client.layout(grid({ nodes, edges: request({ nodes: ['a', 'b'], edges: [['a', 'b']] }).edges }));
    if (!answer.ok) throw new Error(answer.error.message);
    expect(answer.value.engine).toBe('grid');
    expect(answer.value.notes.join('\n')).toContain('ELK failed for the automatic arrangement');
  });
});
