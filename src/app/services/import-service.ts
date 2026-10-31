/**
 * The import flow of the app services (step 5.1c): preview, revise, cancel, apply over the REAL ports (snapshot bytes, the batch
 * and quarantine store, the asset stage behind the write queue's `blobsFor`, main's clock and RNG with a new seed per call). Two
 * paths, one pipeline (note E7): the compute worker through `createComputeImport`, or the same Phase 3 session on this thread when
 * the caller asked for it. A batch lives on the path that made it. One operation at a time (`flow-gate.ts`); apply answers only
 * after `flush()` (`durabilityOf`); a cancel is honoured before the commit (`guardStore`) and changes nothing.
 */
import type { ImportApplyResult, ImportBatchReport, ImportPlan, TaskOptions } from '@/io';
import { sha256Hex } from '@/io/hash';
import { createComputeImport, idFactoryFrom, type ComputeImport, type ReplicaSync } from '@/workers/compute';
import type { IdData, RpcResult, WorkerImportOutcome } from '@/workers/rpc/contracts';
import type { FlowDeps } from './flow-deps';
import { isRefusal, type Operation } from './flow-gate';
import { durabilityOf, guardStore } from './flow-ports';
import { cancelledRefusal, isRoute, readOnlyRefusal, routeOf } from './flow-route';
import { loadChunk } from './lazy-chunk';
import type { InProcessImport } from './import-inprocess';
import type { EarlierImport, FlowOptions, ImportApplyAnswer, ImportFlows, ImportPreviewAnswer } from './flow-types';

type Path = 'worker' | 'in_process';
/** What the report records about the batch's source (decision g). */
interface BatchMeta {
  readonly sourceSha256: string | undefined;
  readonly clockNowIso: string;
  /** The stored batch of the same file, when there is one (its clock was reused). */
  readonly earlier?: EarlierImport;
}

const UNKNOWN = 'no such pending import: it was cancelled, replaced by a newer preview, already applied, or lost with a restarted worker';
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export type ImportService = Omit<ImportFlows, 'undo' | 'lastImport' | 'importLog'>;

export function createImportService(deps: FlowDeps): ImportService {
  const { store, gate, log, router, ids } = deps;
  /** The one pending batch (at most one, Phase 3 Q12): its path and what its report will record. */
  const paths = new Map<string, Path>();
  const metas = new Map<string, BatchMeta>();
  let activeOp: Operation | undefined;
  let workerNow = '';
  /** The clock a re-import of the same file reuses (step 5.9a, PERSISTENCE section 6); undefined: the injected clock. Set only while a gated call runs. */
  let clockOverride: string | undefined;
  const clockNow = (): string => clockOverride ?? ids.now();

  const idData = (): IdData => ({ nowIso: clockNow(), seed: Math.floor(deps.env.random.next() * 0x1_0000_0000) });

  /** The report gets the source's SHA-256 and the clock time used when it is stored. */
  const withMeta = (report: ImportBatchReport, meta: BatchMeta | undefined): ImportBatchReport =>
    meta === undefined ? report : { ...report, ...(meta.sourceSha256 === undefined ? {} : { sourceSha256: meta.sourceSha256 }), clockNowIso: meta.clockNowIso };
  const batches = {
    saveImportBatch(row: Parameters<FlowDeps['durable']['saveImportBatch']>[0]) {
      const meta = metas.get(row.id);
      const plain = typeof row.report === 'object' && row.report !== null && !Array.isArray(row.report);
      return deps.durable.saveImportBatch(meta === undefined || !plain ? row : { ...row, report: withMeta(row.report as unknown as ImportBatchReport, meta) as unknown as typeof row.report });
    },
    async addQuarantine(rows: Parameters<FlowDeps['durable']['addQuarantine']>[0]) {
      const added = await deps.durable.addQuarantine(rows);
      // the status line says how many records are set aside (step 5.11b); the store answered with the rows it really added
      if (added.length > 0) deps.status.update({ quarantinedCount: deps.status.get().quarantinedCount + added.length });
      return added;
    },
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
  // The pipeline is its own chunk, loaded when the first preview or revise runs on this thread; a chunk that fails to load is a refusal in words.
  let inProcess: InProcessImport | undefined;
  const inProcessImport = async (): Promise<{ readonly ok: true; readonly value: InProcessImport } | { readonly ok: false; readonly refusal: ImportPreviewAnswer }> => {
    if (inProcess !== undefined) return { ok: true, value: inProcess };
    const chunk = await loadChunk(() => import('./import-inprocess'), 'The import code for this thread');
    if (!chunk.ok) return { ok: false, refusal: { ok: false, code: 'WORKER_DOWN', message: chunk.message } };
    inProcess = chunk.value.createInProcessImport({
      store: router.port,
      ids: { now: () => current.now(), newId: (prefix) => current.newId(prefix) },
      snapshots,
      batches,
      assetStage: deps.assetStage.port,
    });
    return { ok: true, value: inProcess };
  };

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
            workerNow = clockNow();
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

  /** The newest stored batch of the same file (same SHA-256) that recorded the clock it used; the files before 5.1c have none. */
  const earlierBatchOf = async (sha: string | undefined): Promise<{ readonly earlier: EarlierImport; readonly clockNowIso: string } | undefined> => {
    if (sha === undefined) return undefined;
    for (const row of await deps.durable.listImportBatches()) {
      const report = row.report;
      if (typeof report !== 'object' || report === null || Array.isArray(report)) continue;
      const found = report as Record<string, unknown>;
      if (found.sourceSha256 !== sha || typeof found.clockNowIso !== 'string') continue;
      return {
        clockNowIso: found.clockNowIso,
        earlier: {
          batchId: row.id,
          appliedAt: typeof found.appliedAt === 'string' ? found.appliedAt : row.createdAt,
          fileName: typeof found.fileName === 'string' ? found.fileName : 'an earlier file',
        },
      };
    }
    return undefined;
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
        const sourceSha256 = await hashOf(source);
        const before = await earlierBatchOf(sourceSha256);
        clockOverride = before?.clockNowIso;
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
          const loaded = await inProcessImport();
          if (!loaded.ok) return loaded.refusal;
          const { session, parseImportSource } = loaded.value;
          const parsed = await parseImportSource({ fileName, bytes: source }, { runner: deps.env.migrationRunner }, task);
          if (!parsed.ok) answer = { ok: false, code: parsed.code, message: parsed.message, ...(parsed.detail === undefined ? {} : { detail: parsed.detail }) };
          else {
            const outcome = await session.preview({ parsed: parsed.result, fileName, ...(request === undefined ? {} : { request }) }, task);
            answer = outcome.ok ? { ok: true, plan: outcome.plan, inProcess: true } : outcome;
          }
        }
        clockOverride = undefined;
        if (!answer.ok) return answer;
        const earlier = before?.earlier;
        remember(answer.plan.preview.batchId, route.kind === 'worker' ? 'worker' : 'in_process', { sourceSha256, clockNowIso: nowIso, ...(earlier === undefined ? {} : { earlier }) });
        return earlier === undefined ? answer : { ...answer, earlierImport: earlier };
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
      const meta = metas.get(batchId);
      return gatedPreview('revising the plan', options, async (task) => {
        clockOverride = meta?.clockNowIso; // the plan is revised with the clock of its preview, so the records do not change under the user
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
          const loaded = await inProcessImport();
          if (!loaded.ok) return loaded.refusal;
          const outcome = await loaded.value.session.revise(batchId, request, task);
          answer = outcome.ok ? { ok: true, plan: outcome.plan, inProcess: true } : outcome;
        }
        clockOverride = undefined;
        if (!answer.ok) return answer;
        const earlier = meta?.earlier;
        remember(answer.plan.preview.batchId, route.kind === 'worker' ? 'worker' : 'in_process', { sourceSha256: meta?.sourceSha256, clockNowIso: nowIso, ...(earlier === undefined ? {} : { earlier }) });
        return earlier === undefined ? answer : { ...answer, earlierImport: earlier };
      });
    },

    async cancel(batchId) {
      const path = paths.get(batchId);
      if (path === undefined) return { cancelled: false };
      paths.delete(batchId);
      metas.delete(batchId);
      if (path === 'in_process') return { cancelled: inProcess?.session.cancel(batchId) ?? false };
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
      // The writer's slices (step 5.11b): how many record rows the one transaction has put so far, of all of them.
      const stopWatching = deps.adapter?.watchWriteProgress(({ written, total }) => op.progress(written, total));
      let applied = false;
      try {
        let result: ImportApplyResult;
        if (route.kind === 'worker') result = await workerFlow(route.sync).apply(batchId, plan);
        else {
          current = idFactoryFrom(idData());
          const loaded = await inProcessImport();
          if (!loaded.ok) return { ok: false, code: 'WORKER_DOWN', message: loaded.refusal.ok ? '' : loaded.refusal.message };
          result = await loaded.value.session.apply(batchId, plan);
        }
        if (!result.ok) return guard.cancelledAtCommit() ? cancelledRefusal() : result;
        const meta = metas.get(batchId);
        paths.delete(batchId);
        metas.delete(batchId);
        op.stage('saving');
        const durable = await durabilityOf(deps.adapter, result.revision);
        const notes = [...deps.droppedNotes()];
        if (durable.sessionOnly) {
          notes.push(`nothing is saved in this session${plan.preview.assets.toStore > 0 ? `; the bytes of ${plan.preview.assets.toStore} asset file(s) were not kept` : ''}`);
        }
        applied = true;
        return { ...result, report: withMeta(result.report, meta), ...durable, inProcess: route.kind === 'in_process', notes };
      } finally {
        stopWatching?.();
        activeOp = undefined;
        router.clear();
        op.end();
        if (applied) deps.afterImport(); // the slot is free; the browser's answer never holds a flow
      }
    },
  };
}
