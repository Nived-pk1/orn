/**
 * `loadElk` inside a worker scope (step 5.1d review, follow-up a). elkjs 0.12.0's `elk-worker` takes "no `document`, but `self`" to
 * mean it IS a web worker: it installs its own `self.onmessage` and exports no `Worker` class, so the bundled build cannot start
 * ("_Worker is not a constructor"). The test makes Node look like a worker scope (a `self`, no `document`) and puts a sentinel on
 * `self.onmessage`: ELK must load, lay out, leave the sentinel alone and leave no `document` behind. The real thing in three
 * browsers is the e2e smoke (tests/e2e/smoke.spec.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadElk } from './load';

describe('loadElk in a worker scope (a self and no document)', () => {
  const scope = globalThis as { self?: unknown; document?: unknown };
  const sentinel = (): void => undefined;
  let hadSelf = false;
  let before: unknown;

  beforeAll(() => {
    hadSelf = 'self' in scope;
    before = scope.self;
    const fakeSelf = { onmessage: sentinel };
    scope.self = fakeSelf;
    expect(typeof scope.document).toBe('undefined');
  });
  afterAll(() => {
    if (hadSelf) scope.self = before;
    else delete scope.self;
  });

  it('loads ELK, answers a layout, keeps the scope\'s own onmessage and removes its stand-in document', async () => {
    const make = await loadElk();
    expect((scope.self as { onmessage: unknown }).onmessage).toBe(sentinel);
    expect('document' in scope).toBe(false);
    const graph = await make().layout({
      id: 'root',
      children: [
        { id: 'a', width: 40, height: 20 },
        { id: 'b', width: 40, height: 20 },
      ],
      edges: [{ id: 'e', sources: ['a'], targets: ['b'] }],
    } as never);
    expect((graph as { children?: { x?: number }[] }).children?.map((child) => typeof child.x)).toEqual(['number', 'number']);
    expect((scope.self as { onmessage: unknown }).onmessage).toBe(sentinel);
    expect('document' in scope).toBe(false);
  });

  it('a second load (the module is cached) is as clean as the first', async () => {
    await loadElk();
    expect((scope.self as { onmessage: unknown }).onmessage).toBe(sentinel);
    expect('document' in scope).toBe(false);
  });
});
