/**
 * Type-level only (docs/PROGRESS.md "Phase 3 contract decisions", Q12): io/persistence must not import
 * `src/workers`, so `TaskOptions` is a structurally looser stand-in for `RpcCallContext` there. The direction
 * that has to hold is `RpcCallContext` assignable to `TaskOptions` — a Phase 4 compute-worker method (which
 * receives a real `RpcCallContext`) can pass it straight through to a `TaskOptions`-typed pure function without
 * adapting it. The reverse does NOT hold: `RpcCallContext.signal`/`.progress` are required, `TaskOptions`'s are
 * optional and named differently (`onProgress`), so a bare `TaskOptions` value cannot stand in for a full
 * `RpcCallContext` (nothing to fail — `expectTypeOf` runs at typecheck time, `npm run typecheck`; caught here
 * so a future edit to either shape that breaks this is a compile error, not a runtime surprise).
 */
import { expectTypeOf, it } from 'vitest';
import type { RpcCallContext } from '@/workers/rpc/contracts';
import type { TaskOptions } from '@/io/contracts';

it('type: RpcCallContext is assignable to TaskOptions', () => {
  expectTypeOf<RpcCallContext>().toExtend<TaskOptions>();
});
