/**
 * Test kit of the import screen (step 5.9a): fake ports whose answers a test sets, and plans with conflicts, findings, quarantined
 * records and a legacy report. Test-only; nothing here is used by the app.
 */
import { vi, type Mock } from 'vitest';
import type { ConflictResolution, IdConflict, ImportPlan, ImportPreview, LegacyImportReport } from '@/io';
import type { Finding } from '@/core/validation/contracts';
import type { DataExchangePorts, OperationInfo } from '@/features/data-exchange';

export interface FakePorts extends DataExchangePorts {
  readonly preview: Mock;
  readonly revise: Mock;
  readonly cancel: Mock;
  readonly apply: Mock;
  readonly undo: Mock;
  readonly lastImport: Mock;
  /** Test control: what `unavailable()` answers, what `operation()` answers (and tells the subscribers), the record count. */
  readonly control: { reason: string | undefined; records: number; operation: OperationInfo | null };
  setOperation(operation: OperationInfo | null): void;
}

export function fakePorts(): FakePorts {
  const listeners = new Set<() => void>();
  const control = { reason: undefined as string | undefined, records: 0, operation: null as OperationInfo | null };
  return {
    preview: vi.fn(),
    revise: vi.fn(),
    cancel: vi.fn(() => Promise.resolve({ cancelled: true })),
    apply: vi.fn(),
    undo: vi.fn(),
    lastImport: vi.fn(() => Promise.resolve({ fileName: 'earlier.orn.json', appliedAt: '2026-10-12T10:00:00.000Z', mode: 'merge', undoable: true })),
    unavailable: () => control.reason,
    operation: () => control.operation,
    subscribeOperation(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    recordCount: () => control.records,
    nameOf: (ref) => (ref.id === 'spc_1' ? 'Ethanol' : undefined),
    log: vi.fn(),
    control,
    setOperation(operation) {
      control.operation = operation;
      for (const listener of [...listeners]) listener();
    },
  };
}

export const APPLIED_OK = { ok: true, revision: 2, snapshotId: 'snap', report: {}, reportSaved: true, saved: true, sessionOnly: false, save: null, inProcess: false, notes: [] } as const;

const conflict = (id: string, resolution: ConflictResolution, identical: boolean, kind = 'species'): IdConflict => ({ ref: { kind, id } as IdConflict['ref'], resolution, identical });

export interface PlanOptions {
  readonly mode?: 'merge' | 'replace_all';
  readonly preview?: Partial<ImportPreview>;
  readonly conflicts?: readonly IdConflict[];
  readonly excluded?: ImportPlan['excluded'];
}

/** A plan of a small ORN dataset: five records, nothing in conflict unless asked. */
export function plan(options: PlanOptions = {}): ImportPlan {
  const preview: ImportPreview = {
    batchId: 'batch-1',
    format: 'orn.dataset',
    detectedSchemaVersion: 1,
    migrationsApplied: [],
    counts: { species: { incoming: 3, new: 3, identical: 0, conflicting: 0 }, reaction: { incoming: 2, new: 2, identical: 0, conflicting: 0 } },
    quarantined: [],
    conflicts: [],
    findings: [],
    findingSummary: { error: 0, warning: 0, info: 0, reviewRequired: 0, truncated: false },
    decisions: [],
    richTextLinksRewritten: 0,
    unsafeKeysRenamed: [],
    kindMismatches: [],
    rejectedAssets: [],
    packageIssues: [],
    assets: { toStore: 0, notStored: 0, withoutBytes: 0 },
    mergedRecordCount: 5,
    canConfirm: true,
    blockers: [],
    ...options.preview,
  };
  return { preview, mode: options.mode ?? 'merge', decisions: preview.decisions, conflicts: options.conflicts ?? [], excluded: options.excluded ?? [], copyIdMap: [] };
}

/** Three records in both: one identical, two that differ (the default for a different one is `keep_current`). */
export function conflictingPlan(): ImportPlan {
  return plan({
    conflicts: [conflict('spc_1', 'identical_skip', true), conflict('spc_2', 'keep_current', false), conflict('spc_3', 'keep_current', false)],
    preview: { counts: { species: { incoming: 3, new: 0, identical: 1, conflicting: 2 } }, mergedRecordCount: 3 },
  });
}

export const errorFinding = (id: string, subject: string): Finding => ({
  id: `fnd_${id}`,
  ruleId: 'REF-001',
  level: 2,
  severity: 'error',
  subject: { kind: 'reaction', id: subject } as Finding['subject'],
  path: 'outcomes[0].products[0].ref',
  message: `a reference to ${id} does not resolve`,
  related: [],
});

/** A plan that cannot be confirmed: one error finding on a record of the file. */
export function blockedPlan(): ImportPlan {
  return plan({
    preview: {
      canConfirm: false,
      blockers: ['1 errors must be fixed or those records left out'],
      findings: [errorFinding('spc_missing', 'rxn_1')],
      findingSummary: { error: 1, warning: 0, info: 0, reviewRequired: 0, truncated: false },
    },
  });
}

export function legacyReport(extra: Partial<LegacyImportReport> = {}): LegacyImportReport {
  return {
    sourceSystem: 'orn-legacy-v6',
    sourceSchemaVersion: 6,
    createdCounts: { species: 4, reaction: 3, class: 2 },
    reviewItems: [{ subject: { kind: 'class', id: 'cls_a' }, reason: 'the hub has two parents' }],
    preservedUnmappedFields: { colour: 2 },
    notImported: [],
    consumedByDefault: { 'compounds[*].name': 1 },
    notes: {},
    documentUnmapped: {},
    collisions: [],
    unsafeKeysRenamed: [],
    decisions: [],
    reagentFamilies: [{ value: 'oxidant', count: 2 }],
    ...extra,
  } as LegacyImportReport;
}

/** A legacy v6 plan with one hub decision, one review item and nothing not imported. */
export function legacyPlan(extra: Partial<LegacyImportReport> = {}): ImportPlan {
  const decisions = [{ id: 'hub:cls_a', subject: { kind: 'class', id: 'cls_a' }, question: 'Import the hub "Acids" as', options: ['class', 'species'], chosen: 'class' }];
  return plan({ mode: 'replace_all', preview: { format: 'legacy_v6', decisions: decisions as never, legacyReport: legacyReport(extra), mergedRecordCount: 9, counts: { species: { incoming: 4, new: 4, identical: 0, conflicting: 0 }, reaction: { incoming: 3, new: 3, identical: 0, conflicting: 0 }, class: { incoming: 2, new: 2, identical: 0, conflicting: 0 } } } });
}
