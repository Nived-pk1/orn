/**
 * The boot sequence (docs/PERSISTENCE.md §4), in this order:
 *  1. open the database (IndexedDB unavailable → session-only, the result says why);
 *  2. take the writer lock (not granted → read-only, nothing is written);
 *  3. read rows and meta in one transaction and look at `schemaVersion`: newer → read-only; older or refused by the
 *     runner → `boot-migrate.ts`; damaged meta → read-only `integrity_failure`;
 *  4. per-record L1: invalid rows are quarantined (with issues and a capped raw value), never deleted;
 *  5. indexes and L1–L3 findings; asset records without bytes (AST-002); uiState (tolerant); crash check;
 *  6. markers: this session is running, integrity check done.
 * Every branch that cannot make the data writable leaves the queue read-only and writes NOTHING.
 */
import { coreIndexEngine } from '@/core/indexes/engine';
import { DatasetMetaSchema, type CanonicalState } from '@/core/schema';
import { validator } from '@/core/validation';
import type { Finding } from '@/core/validation/contracts';
import { assembleState } from './boot-load';
import { migrateOnDisk, tolerantDocument } from './boot-migrate';
import { restoreUiState, unavailable } from './boot-checks';
import type { BootPorts } from './boot-ports';
import type { BootReport, OpenResult } from './contracts';
import { describeError } from './events';

const isRevision = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

type ReadOnlyReason = NonNullable<Extract<OpenResult, { mode: 'read_write' | 'read_only' }>['readOnlyReason']>;

export async function runBoot(ports: BootPorts): Promise<OpenResult> {
  try {
    await ports.db.open();
  } catch (error) {
    return unavailable(error);
  }
  const writer = (await ports.lock.acquire()) === 'acquired';
  if (!writer) ports.setReadOnly(true);

  let committed;
  try {
    committed = await ports.readCommitted();
  } catch (error) {
    return { mode: 'unavailable', reason: 'unknown', detail: `the stored data could not be read (${describeError(error)})` };
  }
  const { rows, meta } = committed;
  const now = ports.ids.now();
  const stored = meta.schemaVersion;
  const storedVersion = typeof stored === 'number' ? stored : null;
  const quarantined = () => ports.countQuarantine();

  const refuse = async (reason: ReadOnlyReason, detail: string, revision = 0): Promise<OpenResult> => {
    ports.setReadOnly(true);
    if (writer) await ports.lock.release();
    return { mode: 'read_only', readOnlyReason: reason, detail, state: null, revision, storedSchemaVersion: storedVersion, quarantinedCount: await quarantined() };
  };

  const nothingStored = rows.length === 0 && stored === undefined && meta.datasetMeta === undefined && meta.revision === undefined;
  if (nothingStored) {
    if (writer) {
      await ports.setCleanShutdown(null);
      await ports.continueFrom(0);
    }
    return { mode: writer ? 'read_write' : 'read_only', ...(writer ? {} : { readOnlyReason: 'other_tab_is_writer' as const }), state: null, revision: 0, storedSchemaVersion: null, quarantinedCount: await quarantined() };
  }

  const target = ports.runner.target;
  if (typeof stored === 'number' && Number.isInteger(stored) && stored > target) {
    return refuse('newer_schema', `Data was saved by a newer version of this app (schema version ${stored}; this app supports up to ${target}). It is open read-only and nothing was changed; update the app to edit it.`, isRevision(meta.revision) ? meta.revision : 0);
  }
  if (!isRevision(meta.revision)) return refuse('integrity_failure', `the stored revision is missing or not a non-negative integer (${JSON.stringify(meta.revision)}); nothing was changed`);
  const revision = meta.revision;

  let state: CanonicalState;
  let findings: readonly Finding[];
  let migrationSteps: BootReport['migrationSteps'] = [];
  let outRevision = revision;
  let newlyQuarantined = 0;
  let quarantineTruncated = 0;

  if (stored !== target) {
    // Older, or not a version at all: the runner decides, in memory, before anything is written.
    if (!writer) return refuse('other_tab_is_writer', 'Another tab is the writer, and the stored data needs a migration that only the writer may run; it opens read-only without data until that tab has migrated it.', revision);
    const doc = tolerantDocument(rows, meta.datasetMeta, stored, now, ports.generator);
    const migrated = await migrateOnDisk(ports, doc, stored, revision);
    if (!migrated.ok) return refuse(migrated.reason, migrated.detail, revision);
    ({ state, findings, steps: migrationSteps, revision: outRevision } = migrated);
  } else {
    const datasetMeta = DatasetMetaSchema.safeParse(meta.datasetMeta);
    if (!datasetMeta.success) {
      return refuse('integrity_failure', `the stored dataset meta is missing or invalid (${datasetMeta.error.issues.slice(0, 3).map((i) => `${i.path.map(String).join('.')}: ${i.message}`).join(' | ')}); nothing was changed`, revision);
    }
    const assembled = assembleState(rows, datasetMeta.data, now);
    state = assembled.state;
    if (writer && assembled.rejected.length > 0) {
      const added = new Set(await ports.addQuarantine(assembled.rejected));
      newlyQuarantined = added.size;
      quarantineTruncated = assembled.rejected.filter((r) => added.has(r.id) && r.rawTruncated !== undefined).length;
    }
    findings = validator.validateAll(state, coreIndexEngine.build(state, revision));
  }

  const blobIds = new Set(await ports.listAssetBlobIds());
  const assetIdsWithoutBlob = Object.keys(state.records.asset).filter((id) => !blobIds.has(id)).sort();

  const marker = meta.lastCleanShutdownAt;
  const crashSuspected = marker !== undefined && typeof marker !== 'string';
  const editorSessionIds = crashSuspected ? await ports.listEditorSessionIds() : [];

  const ui = restoreUiState(await ports.listUiStateRows(), ports.uiStateValidators);
  if (writer) {
    if (ui.reset.length > 0) await ports.deleteUiState(ui.reset);
    await ports.continueFrom(outRevision, state.meta);
    await ports.setCleanShutdown(null);
    await ports.setIntegrityCheck(ports.ids.now());
  }

  return {
    mode: writer ? 'read_write' : 'read_only',
    ...(writer ? {} : { readOnlyReason: 'other_tab_is_writer' as const }),
    state,
    revision: outRevision,
    storedSchemaVersion: storedVersion,
    quarantinedCount: await quarantined(),
    bootReport: { migrationSteps, findings, assetIdsWithoutBlob, crashSuspected, editorSessionIds, uiState: ui.valid, uiStateReset: ui.reset, newlyQuarantined, quarantineTruncated },
  };
}
