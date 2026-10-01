/**
 * A fake ELK for the layout worker's orchestration tests (step 4.4): it answers instantly with a trivial grid layout (every child
 * on its own row, every edge one straight section), counts its calls, and can be told to wait, hang, throw, or fail to start.
 * No algorithm of ELK's is imitated; these tests count calls and drive timing. The real ELK is in tests/integration/layout-elk.test.ts.
 */
import type { ElkGraph, ElkLike } from '@/layout/elk';

export interface FakeElk {
  /** Makes an instance (what `startLayoutHost` takes). */
  readonly make: () => ElkLike | Promise<ElkLike>;
  /** The graphs ELK was asked to lay out, in order (as received: cloned by nothing, so tests must not mutate them). */
  readonly graphs: ElkGraph[];
  /** Instances made. */
  made: number;
  /** While set, a layout waits for it before answering. */
  gate: Promise<void> | undefined;
  /** While true, a layout never answers. */
  hang: boolean;
  /** While set, a layout rejects with it. */
  failure: Error | undefined;
  /** While set, `make` rejects with it (ELK could not load). */
  makeFailure: Error | undefined;
}

export function createFakeElk(): FakeElk {
  const fake: FakeElk = {
    graphs: [],
    made: 0,
    gate: undefined,
    hang: false,
    failure: undefined,
    makeFailure: undefined,
    make() {
      fake.made += 1;
      if (fake.makeFailure !== undefined) return Promise.reject(fake.makeFailure);
      return {
        async layout(graph) {
          fake.graphs.push(graph);
          if (fake.hang) return new Promise<ElkGraph>(() => undefined);
          if (fake.gate !== undefined) await fake.gate;
          if (fake.failure !== undefined) throw fake.failure;
          const children = graph.children.map((child, i) => ({ ...child, x: 0, y: i * 100 }));
          const at = new Map(children.map((child) => [child.id, child] as const));
          const edges = graph.edges.map((edge) => {
            const from = at.get(edge.sources[0] as string);
            const to = at.get(edge.targets[0] as string);
            return { ...edge, sections: [{ startPoint: { x: 0, y: (from?.y ?? 0) + 10 }, endPoint: { x: 0, y: (to?.y ?? 0) + 10 } }] };
          });
          return { ...graph, children, edges };
        },
      };
    },
  };
  return fake;
}
