/**
 * The compute worker's replica of the canonical state (step 4.2b, ADR-034): the only one, held in the worker. It follows
 * the main store by applying the same ChangeSets through the same paths as the store's commit step: Immer patches, then
 * the index engine's `apply`, then `validateTouchedByRule` ALWAYS with the previous state and the replica's own finding
 * store as `known` (docs/IMPLEMENTATION_PLAN.md Phase 4 note, step 2.13: without `previous` a hub edit costs 39-47 ms
 * instead of 1-4). There is no ERROR gate: the main store already accepted what it sends. Pure and synchronous; time
 * comes from the injected clock, never `Date.now`.
 */
import { applyPatches, enablePatches, freeze, type Patch } from 'immer';
import type { PrecomputedFindings } from '@/core/commands';
import type { ChangeSet } from '@/core/dataset';
import type { ProjectionContext, RouteQuery, RouteSearchResult } from '@/core/graph/contracts';
import { searchRoutes } from '@/core/graph/route';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import { indexEngine } from '@/core/indexes/full';
import { RECORD_KINDS, type CanonicalState, type RecordKind, type RecordRef } from '@/core/schema';
import { RULE_SET_ID, commitFindings, commitTouched, createFindingStore, validator as defaultValidator } from '@/core/validation';
import type { Finding, FindingStore, Validator } from '@/core/validation';
import type { ReplicaAnswer } from '@/workers/rpc/contracts';
import { RpcHostError } from '@/workers/rpc/helpers';

enablePatches();

export interface ReplicaOptions {
  /** Default: the core validator. Tests inject a spy to prove `previous` is always passed. */
  readonly validator?: Validator;
  /** Milliseconds, monotonic enough for a time budget: the route search's clock. Without it the time budget is not enforced. */
  readonly nowMs?: () => number;
}

export interface Replica {
  /** Replaces the replica; nothing changes if it throws. */
  load(state: CanonicalState, revision: number): PrecomputedFindings;
  /** `REPLICA_STALE` as a value; throws (replica unchanged and consistent) only for a malformed ChangeSet or a bug. */
  apply(changes: ChangeSet): ReplicaAnswer<{ readonly revision: number }>;
  validateAll(revision: number, signal?: AbortSignal): ReplicaAnswer<{ readonly findings: readonly Finding[] }>;
  findRoutes(revision: number, query: RouteQuery, signal?: AbortSignal): ReplicaAnswer<{ readonly result: RouteSearchResult }>;
  /** The revision held, or null before the first `load`. */
  revision(): number | null;
  /** Test and bench access; throws NOT_READY before the first `load`. */
  snapshot(): { readonly state: CanonicalState; readonly revision: number; readonly indexes: ReadonlyIndexes; readonly findings: FindingStore };
}

interface Held {
  state: CanonicalState;
  revision: number;
  indexes: ReadonlyIndexes;
  findings: FindingStore;
}

export function recordCountsOf(state: CanonicalState): Record<RecordKind, number> {
  return Object.fromEntries(RECORD_KINDS.map((kind) => [kind, Object.keys(state.records[kind]).length])) as Record<RecordKind, number>;
}

const refsOf = (state: CanonicalState): RecordRef[] =>
  RECORD_KINDS.flatMap((kind) => Object.keys(state.records[kind]).map((id) => ({ kind, id }) as RecordRef));

/** The cheap structural check of a request that crosses a thread: a state without its tables would fail deep inside validation. */
function shapeProblem(state: unknown, revision: unknown): string | undefined {
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 0) return `revision ${String(revision)} is not a non-negative integer`;
  const records = (state as { records?: unknown } | null)?.records;
  if (typeof records !== 'object' || records === null) return 'the state has no records';
  for (const kind of RECORD_KINDS) {
    const table = (records as Record<string, unknown>)[kind];
    if (typeof table !== 'object' || table === null) return `the state has no "${kind}" table`;
  }
  return undefined;
}

export function createReplica(options: ReplicaOptions = {}): Replica {
  const validator = options.validator ?? defaultValidator;
  let held: Held | undefined;

  const stale = (have: number): { readonly ok: false; readonly code: 'REPLICA_STALE'; readonly have: number } => ({ ok: false, code: 'REPLICA_STALE', have });
  const need = (): Held => {
    if (held === undefined) throw new RpcHostError('NOT_READY', 'no replica is loaded; send loadReplica first');
    return held;
  };

  return {
    revision: () => held?.revision ?? null,
    snapshot: need,

    load(state, revision) {
      const problem = shapeProblem(state, revision);
      if (problem !== undefined) throw new RpcHostError('BAD_REQUEST', `loadReplica: ${problem}`);
      const frozen = freeze(state, true);
      const indexes = indexEngine.build(frozen, revision);
      const found = validator.validateAll(frozen, indexes);
      const findings = createFindingStore();
      commitFindings(findings, refsOf(frozen), found);
      held = { state: frozen, revision, indexes, findings };
      return { findings: found, ruleSet: RULE_SET_ID, revision, recordCounts: recordCountsOf(frozen) };
    },

    apply(changes) {
      const replica = need();
      // The same rule as the core index engine: one step forward, or a forward span for a follower's 'remote' ChangeSet.
      const forward = changes.revision === replica.revision + 1 || (changes.cause === 'remote' && changes.revision > replica.revision);
      if (!forward) return stale(replica.revision);
      const previous = replica.state;
      try {
        const next = applyPatches(previous, changes.patches as Patch[]);
        const nextIndexes = indexEngine.apply(replica.indexes, changes, next);
        const touched: RecordRef[] = [...changes.created, ...changes.updated, ...changes.deleted];
        // `previous` is never omitted (Phase 4 note, step 2.13); `replica.findings` is the store the result is committed to.
        const validation = validator.validateTouchedByRule(next, nextIndexes, touched, previous, replica.findings);
        replica.state = next;
        replica.revision = changes.revision;
        replica.indexes = nextIndexes;
        commitTouched(replica.findings, validation);
        return { ok: true, revision: replica.revision };
      } catch (error) {
        // `indexEngine.apply` consumes the old handle; rebuild it for the state the replica still holds.
        replica.indexes = indexEngine.build(replica.state, replica.revision);
        throw error;
      }
    },

    validateAll(revision, signal) {
      const replica = need();
      if (revision !== replica.revision) return stale(replica.revision);
      return { ok: true, findings: validator.validateAll(replica.state, replica.indexes, signal) };
    },

    findRoutes(revision, query, signal) {
      const replica = need();
      if (revision !== replica.revision) return stale(replica.revision);
      // Route search reads no exam scope; the context's `scopeOf` is required by the type only.
      const ctx: ProjectionContext = { state: replica.state, indexes: replica.indexes, scopeOf: () => 'unmapped' };
      const limits = signal === undefined ? query.limits : { ...query.limits, signal };
      const now = options.nowMs;
      return { ok: true, result: searchRoutes(ctx, { ...query, limits }, now === undefined ? {} : { now }) };
    },
  };
}
