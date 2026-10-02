/**
 * The import flow of the app services (step 5.1c): preview, revise, cancel, apply over the REAL ports (snapshot bytes, the batch
 * and quarantine store, the asset stage behind the write queue's `blobsFor`, main's clock and RNG with a new seed per call). Two
 * paths, one pipeline (note E7): the compute worker through `createComputeImport`, or the same Phase 3 session on this thread when
 * the caller asked for it. A batch lives on the path that made it. One operation at a time (`flow-gate.ts`); apply answers only
 * after `flush()` (`durabilityOf`); a cancel is honoured before the commit (`guardStore`) and changes nothing.
 */
import { createImportSession, parseImportSource, type ImportApplyResult, type ImportBatchReport, type ImportPlan, type ImportSession, type TaskOptions } from '@/io';
import { sha256Hex } from '@/io/hash';
import { createComputeImport, idFactoryFrom, type ComputeImport, type ReplicaSync } from '@/workers/compute';
import type { IdData, RpcResult, WorkerImportOutcome } from '@/workers/rpc/contracts';
import type { FlowDeps } from './flow-deps';
import { isRefusal, type Operation } from './flow-gate';
import { durabilityOf, guardStore } from './flow-ports';
import { cancelledRefusal, isRoute, readOnlyRefusal, routeOf } from './flow-route';
import type { FlowOptions, ImportApplyAnswer, ImportFlows, ImportPreviewAnswer } from './flow-types';

type Path = 'worker' | 'in_process';
/** What the report records about the batch's source (decision g). */
interface BatchMeta {
  readonly sourceSha256: string | undefined;
  readonly clockNowIso: string;
}

const UNKNOWN = 'no such pending import: it was cancelled, replaced by a newer preview, already applied, or lost with a restarted worker';
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export type ImportService = Omit<ImportFlows, 'undo'>;

export function createImportService(deps: FlowDeps): ImportService {
  const { store, gate, log, router, ids } = deps;
  /** The one pending batch (at most one, Phase 3 Q12): its path and what its report will record. */
  const paths = new Map<string, Path>();
  const metas = new Map<string, BatchMeta>();
  let activeOp: Operation | undefined;
  let workerNow = '';

  const idData = (): IdData => ({ nowIso: ids.now(), seed: Math.floor(deps.env.random.next() * 0x1_0000_0000) });

  /** The report gets the source's SHA-256 and the clock time used when it is stored. */
  const withMeta = (report: ImportBatchReport, meta: BatchMeta | undefined): ImportBatchReport =>
    meta === undefined ? report : { ...report, ...(meta.sourceSha256 === undefined ? {} : { sourceSha256: meta.sourceSha256 }), clockNowIso: meta.clockNowIso };
  const batches = {
    saveImportBatch(row: Parameters<FlowDeps['durable']['saveImportBatch']>[0]) {
      const meta = metas.get(row.id);
      const plain = typeof row.report === 'object' && row.report !== null && !Array.isArray(row.report);
      return deps.durable.saveImportBatch(meta === undefined || !plain ? row : { ...row, report: withMeta(row.report as unknown as ImportBatchReport, meta) as unknown as typeof row.report });
    },
    addQuarantine: (rows: Parameters<FlowDeps['durable']['addQuarantine']>[0]) => deps.durable.addQuarantine(rows),
  };
  const snapshots = {
    createSnapshot(...args: Parameters<FlowDeps['durable']['createSnapshot']>) {
      activeOp?.stage('snapshot');
      return deps.durable.createSnapshot(...args);
    },
    storeSnapshotBytes(input: Parameters<FlowDeps['durable']['storeSnapshotBytes']>[0]) {
      activeOp?.stage('snapshot');
      return deps.durable.storeSnapshotBytes(input);
    },
    deleteSnapshot: (id: string) => deps.durable.deleteSnapshot(id),
  };

  // The in-process session: the SAME Phase 3 code. Its IDs come from the factory of the call that is running (a new seed per call).
  let current = idFactoryFrom(idData());
  const session: ImportSession = createImportSession({
    store: router.port,
    ids: { now: () => current.now(), newId: (prefix) => current.newId(prefix) },
    snapshots,
    batches,
    assetStage: deps.assetStage.port,
  });

  let worker: { readonly sync: ReplicaSync; readonly flow: ComputeImport } | undefined;
  const workerFlow = (sync: ReplicaSync): ComputeImport => {
    if (worker?.sync !== sync) {
      const flow = createComputeImport({
        sync,
        store: router.port,
        snapshots,
        batches,
        assetStage: deps.assetStage.port,
        ids: {
          now: () => {
            workerNow = ids.now();
            return workerNow;
          },
        },
        generator: deps.env.generator,
        rng: deps.env.random,
      });
      worker = { sync, flow };
    }
    return worker.flow;
  };

  const hashOf = async (source: Blob): Promise<string | undefined> => {
    try {
      return await sha256Hex(new Uint8Array(await source.arrayBuffer()));
    } catch (error) {
      log.add({ source: 'app', event: { type: 'import_hash_failed', message: `the source file could not be hashed, so its report has no SHA-256 (${messageOf(error)})` } });
      return undefined;
    }
  };

  /** A worker call that did not answer: the pending batch is lost with a crash, anything else is "the worker could not". */
  const fromWorker = (result: RpcResult<WorkerImportOutcome>, signal: AbortSignal | undefined): ImportPreviewAnswer => {
    if (result.ok) return result.value.ok ? { ok: true, plan: result.value.plan, inProcess: false } : result.value;
    if (result.error.code === 'CANCELLED' && signal?.aborted === true) return cancelledRefusal();
    if (result.error.code === 'WORKER_CRASHED') return { ok: false, code: 'UNKNOWN_BATCH', message: 'the compute worker restarted; the pending import was lost; preview it again' };
    return { ok: false, code: 'WORKER_DOWN', message: `the compute worker could not answer (${result.error.code}: ${result.error.message}); nothing was imported`, inProcessAvailable: true };
  };

  /** A new pending batch replaces the old one: its path and meta go with it. */
  const remember = (batchId: string, path: Path, meta: BatchMeta): void => {
    paths.clear();
    metas.clear();
    paths.set(batchId, path);
    metas.set(batchId, meta);
  };

  async function gatedPreview(label: string, options: FlowOptions | undefined, run: (task: TaskOptions) => Promise<ImportPreviewAnswer>): Promise<ImportPreviewAnswer> {
    const op = gate.begin('import_preview', label);
    if (isRefusal(op)) return op;
    try {
      return await run({ ...(options?.signal === undefined ? {} : { signal: options.signal }), onProgress: (done, total) => op.progress(done, total) });
    } finally {
      op.end();
    }
  }

  return {
    async preview(source, fileName, request, options) {
      const refused = readOnlyRefusal(store, 'import');
      if (refused !== undefined) return refused;
      if (options?.signal?.aborted === true) return cancelledRefusal();
      const route = routeOf(deps.replica, options);
      if (!isRoute(route)) return route;
      return gatedPreview('previewing the file', options, async (task) => {
        const sha = hashOf(source);
        let answer: ImportPreviewAnswer;
        let nowIso: string;
        if (route.kind === 'worker') {
          workerNow = '';
          answer = fromWorker(await workerFlow(route.sync).preview(source, fileName, request, task), options?.signal);
          nowIso = workerNow;
        } else {
          const data = idData();
          nowIso = data.nowIso;
          current = idFactoryFrom(data);
          const parsed = await parseImportSource({ fileName, bytes: source }, { runner: deps.env.migrationRunner }, task);
          if (!parsed.ok) answer = { ok: false, code: parsed.code, message: parsed.message, ...(parsed.detail === undefined ? {} : { detail: parsed.detail }) };
          else {
            const outcome = await session.preview({ parsed: parsed.result, fileName, ...(request === undefined ? {} : { request }) }, task);
            answer = outcome.ok ? { ok: true, plan: outcome.plan, inProcess: true } : outcome;
          }
        }
        if (answer.ok) remember(answer.plan.preview.batchId, route.kind === 'worker' ? 'worker' : 'in_process', { sourceSha256: await sha, clockNowIso: nowIso });
        return answer;
      });
    },

    async revise(batchId, request, options) {
      const refused = readOnlyRefusal(store, 'import');
      if (refused !== undefined) return refused;
      if (options?.signal?.aborted === true) return cancelledRefusal();
      const path = paths.get(batchId);
      if (path === undefined) return { ok: false, code: 'UNKNOWN_BATCH', message: UNKNOWN };
      const route = routeOf(deps.replica, path === 'in_process' ? { inProcess: true } : undefined);
      if (!isRoute(route)) return route;
      const sourceSha256 = metas.get(batchId)?.sourceSha256;
      return gatedPreview('revising the plan', options, async (task) => {
        let answer: ImportPreviewAnswer;
        let nowIso: string;
        if (route.kind === 'worker') {
          workerNow = '';
          answer = fromWorker(await workerFlow(route.sync).revise(batchId, request, task), options?.signal);
          nowIso = workerNow;
        } else {
          const data = idData();
          nowIso = data.nowIso;
          current = idFactoryFrom(data);
          const outcome = await session.revise(batchId, request, task);
          answer = outcome.ok ? { ok: true, plan: outcome.plan, inProcess: true } : outcome;
        }
        if (answer.ok) remember(answer.plan.preview.batchId, route.kind === 'worker' ? 'worker' : 'in_process', { sourceSha256, clockNowIso: nowIso });
        return answer;
      });
    },

    async cancel(batchId) {
      const path = paths.get(batchId);
      if (path === undefined) return { cancelled: false };
      paths.delete(batchId);
      metas.delete(batchId);
      if (path === 'in_process') return { cancelled: session.cancel(batchId) };
      const sync = deps.replica.sync();
      if (sync === undefined) return { cancelled: false };
      const answer = await workerFlow(sync).cancel(batchId);
      return { cancelled: answer.ok && answer.value.cancelled };
    },

    async apply(batchId: string, plan: ImportPlan, options?: FlowOptions): Promise<ImportApplyAnswer> {
      const refused = readOnlyRefusal(store, 'import');
      if (refused !== undefined) return refused;
      const path = paths.get(batchId);
      if (path === undefined) return { ok: false, code: 'UNKNOWN_BATCH', message: UNKNOWN };
      if (options?.signal?.aborted === true) return cancelledRefusal();
      const route = routeOf(deps.replica, path === 'in_process' ? { inProcess: true } : undefined);
      if (!isRoute(route)) return route;
      const op = gate.begin('import_apply', 'preparing');
      if (isRefusal(op)) return op;
      const guard = guardStore(store, options?.signal, () => op.stage('committing'));
      router.use(guard);
      activeOp = op;
      try {
        let result: ImportApplyResult;
        if (route.kind === 'worker') result = await workerFlow(route.sync).apply(batchId, plan);
        else {
          current = idFactoryFrom(idData());
          result = await session.apply(batchId, plan);
        }
        if (!result.ok) return guard.cancelledAtCommit() ? cancelledRefusal() : result;
        const meta = metas.get(batchId);
        paths.delete(batchId);
        metas.delete(batchId);
        op.stage('saving');
        const durable = await durabilityOf(deps.adapter, result.revision);
        const notes = [...deps.droppedNotes(), ...(await deps.afterImport())];
        if (durable.sessionOnly) {
          notes.push(`nothing is saved in this session${plan.preview.assets.toStore > 0 ? `; the bytes of ${plan.preview.assets.toStore} asset file(s) were not kept` : ''}`);
        }
        return { ...result, report: withMeta(result.report, meta), ...durable, inProcess: route.kind === 'in_process', notes };
      } finally {
        activeOp = undefined;
        router.clear();
        op.end();
      }
    },
  };
}
