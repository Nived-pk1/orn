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
  ReplicaAnswer,
  ReplicaStale,
  RpcResult,
  SearchWorkerApi,
} from '@/workers/rpc/contracts';
import type { DepictOutcome, ParseOutcome, SmartsOutcome } from '@/chem/contracts';
import type { PrecomputedFindings } from '@/core/commands';
import type { Finding } from '@/core/validation/contracts';

it('type: RpcClient<Api> exists for all four worker APIs and answers RpcResult values', () => {
  expectTypeOf<RpcClient<ComputeWorkerApi>['validateAll']>().toEqualTypeOf<
    (params: { readonly revision: number }, options?: RpcCallOptions) => Promise<RpcResult<ReplicaAnswer<{ readonly findings: readonly Finding[] }>>>
  >();
  expectTypeOf<RpcClient<ChemWorkerApi>>().toHaveProperty('parse');
  expectTypeOf<RpcClient<LayoutWorkerApi>>().toHaveProperty('layout');
  expectTypeOf<RpcClient<SearchWorkerApi>>().toHaveProperty('search');
  expectTypeOf<RpcClient<SearchWorkerApi>>().toHaveProperty('terminate');
});

it('type: RpcMethodSpecs names every method, with idempotent and timeoutMs', () => {
  const full: RpcMethodSpecs<LayoutWorkerApi> = { layout: { idempotent: true, timeoutMs: 2_000 }, layoutFallback: { idempotent: true, timeoutMs: 2_000 } };
  // @ts-expect-error a method without a spec is a compile error
  const missing: RpcMethodSpecs<SearchWorkerApi> = { load: { idempotent: true, timeoutMs: 1 } };
  // @ts-expect-error timeoutMs is required
  const noTimeout: RpcMethodSpecs<LayoutWorkerApi> = { layout: { idempotent: true }, layoutFallback: { idempotent: true, timeoutMs: 2_000 } };
  void [full, missing, noTimeout];
});

it('type: the compute replica calls answer what the store takes and refuse stale revisions as values (step 4.2b)', () => {
  // loadReplica answers exactly the precomputed findings replaceState and reload accept.
  expectTypeOf<RpcClient<ComputeWorkerApi>['loadReplica']>().returns.resolves.toEqualTypeOf<RpcResult<PrecomputedFindings>>();
  // applyChanges, validateAll and findRoutes answer ok or REPLICA_STALE with the revision held; a stale answer is a value.
  expectTypeOf<Extract<ReplicaAnswer<{ readonly revision: number }>, { ok: false }>>().toEqualTypeOf<ReplicaStale>();
  expectTypeOf<ReplicaStale>().toEqualTypeOf<{ readonly ok: false; readonly code: 'REPLICA_STALE'; readonly have: number }>();
  expectTypeOf<Extract<ReplicaAnswer<{ readonly revision: number }>, { ok: true }>['revision']>().toBeNumber();
});

it('type: the chem worker answers failure values with a reason; only `invalid` means the structure is bad (step 4.3a, Q7)', () => {
  type Failed<T> = Extract<T, { readonly ok: false }>;
  expectTypeOf<Failed<ParseOutcome>['reason']>().toEqualTypeOf<'invalid' | 'unavailable' | 'timeout'>();
  expectTypeOf<Failed<DepictOutcome>['reason']>().toEqualTypeOf<'invalid' | 'unavailable' | 'timeout' | 'refused'>();
  expectTypeOf<Failed<SmartsOutcome>['reason']>().toEqualTypeOf<'invalid' | 'unavailable' | 'timeout' | 'invalid_smarts'>();
  expectTypeOf<RpcClient<ChemWorkerApi>['parse']>().returns.resolves.toEqualTypeOf<RpcResult<ParseOutcome>>();
  expectTypeOf<RpcClient<ChemWorkerApi>['depict']>().returns.resolves.toEqualTypeOf<RpcResult<DepictOutcome>>();
  // checkAll({ revision }) assumed state in the chem worker (D1): it is gone; the batch checks replaced it (step 4.3b, Q2).
  expectTypeOf<keyof ChemWorkerApi>().toEqualTypeOf<'parse' | 'depict' | 'checkSpecies' | 'checkReaction' | 'checkMechanism' | 'matches'>();
});
