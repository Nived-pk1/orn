/**
 * Type-level (step 4.1, Phase 4 contract decisions Q5): `RpcClient<Api>` must typecheck for every worker API
 * (it did not for an interface before: TS2344 "Index signature ... is missing"), and `RpcMethodSpecs<Api>` must
 * name every method.
 */
import { expectTypeOf, it } from 'vitest';
import type {
  ChemWorkerApi,
  ComputeWorkerApi,
  LayoutWorkerApi,
  RpcCallOptions,
  RpcClient,
  RpcMethodSpecs,
  RpcResult,
  SearchWorkerApi,
} from '@/workers/rpc/contracts';
import type { Finding } from '@/core/validation/contracts';

it('type: RpcClient<Api> exists for all four worker APIs and answers RpcResult values', () => {
  expectTypeOf<RpcClient<ComputeWorkerApi>['validateAll']>().toEqualTypeOf<
    (params: { readonly revision: number }, options?: RpcCallOptions) => Promise<RpcResult<readonly Finding[]>>
  >();
  expectTypeOf<RpcClient<ChemWorkerApi>>().toHaveProperty('parse');
  expectTypeOf<RpcClient<LayoutWorkerApi>>().toHaveProperty('layout');
  expectTypeOf<RpcClient<SearchWorkerApi>>().toHaveProperty('search');
  expectTypeOf<RpcClient<SearchWorkerApi>>().toHaveProperty('terminate');
});

it('type: RpcMethodSpecs names every method, with idempotent and timeoutMs', () => {
  const full: RpcMethodSpecs<LayoutWorkerApi> = { layout: { idempotent: true, timeoutMs: 2_000 } };
  // @ts-expect-error a method without a spec is a compile error
  const missing: RpcMethodSpecs<SearchWorkerApi> = { load: { idempotent: true, timeoutMs: 1 } };
  // @ts-expect-error timeoutMs is required
  const noTimeout: RpcMethodSpecs<LayoutWorkerApi> = { layout: { idempotent: true } };
  void [full, missing, noTimeout];
});
