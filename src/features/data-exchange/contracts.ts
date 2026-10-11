/**
 * The ONE interface the import screen needs from outside (step 5.9a, as the search, navigator and inspector ports): the import flows
 * (preview, revise, cancel, apply, Undo import, the newest import), what is running, the writer's reason, the record count and the
 * names of live records. `src/app` fills it from the app services; the feature imports no `src/app`, no other feature, and the io
 * types only. The answers are written structurally (a failure is `{ ok: false, code, message }`), so the services' answers fit as they are.
 */
import type { ImportApplyResult, ImportPlan, ImportPlanRequest } from '@/io';
import type { RecordRef } from '@/core/schema';

/** A refusal or failure of any flow, as a value. `inProcessAvailable`: the compute worker is down and this thread can do it instead. */
export interface FlowFailure {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
  readonly detail?: Readonly<Record<string, unknown>>;
  readonly inProcessAvailable?: true;
  readonly busyWith?: string;
}

/** The earlier import of the same file (its SHA-256 matched a stored batch). */
export interface EarlierImportInfo {
  readonly batchId: string;
  readonly appliedAt: string;
  readonly fileName: string;
}

export type PreviewAnswer = { readonly ok: true; readonly plan: ImportPlan; readonly inProcess: boolean; readonly earlierImport?: EarlierImportInfo } | FlowFailure;

export type ApplyAnswer =
  | (Extract<ImportApplyResult, { ok: true }> & {
      readonly saved: boolean;
      readonly sessionOnly: boolean;
      readonly inProcess: boolean;
      readonly notes: readonly string[];
      /** The save state when the change is not saved and storage exists (its last error says why). */
      readonly save?: { readonly lastError: string | null } | null;
    })
  | FlowFailure;

export type UndoAnswer = { readonly ok: true; readonly saved: boolean; readonly sessionOnly: boolean; readonly notes: readonly string[] } | FlowFailure;

export interface LastImportInfo {
  readonly fileName: string;
  readonly appliedAt: string;
  readonly mode: string;
  readonly undoable: boolean;
}

export interface FlowCallOptions {
  readonly signal?: AbortSignal;
  readonly inProcess?: boolean;
}

/** Where the running operation is (`AppStatus.operation`), as far as the screen words it. */
export interface OperationInfo {
  readonly kind: string;
  readonly stage: string;
  readonly progress: { readonly done: number; readonly total: number | null } | null;
}

export interface DataExchangePorts {
  preview(blob: Blob, fileName: string, request: ImportPlanRequest, options?: FlowCallOptions): Promise<PreviewAnswer>;
  revise(batchId: string, request: ImportPlanRequest, options?: FlowCallOptions): Promise<PreviewAnswer>;
  cancel(batchId: string): Promise<unknown>;
  apply(batchId: string, plan: ImportPlan, options?: FlowCallOptions): Promise<ApplyAnswer>;
  undo(options?: FlowCallOptions): Promise<UndoAnswer>;
  lastImport(): Promise<LastImportInfo | undefined>;
  /** Why an import cannot start now (a read-only tab, another operation), in words; undefined: it can. */
  unavailable(): string | undefined;
  /** The running whole-state operation, or null. */
  operation(): OperationInfo | null;
  subscribeOperation(listener: () => void): () => void;
  /** The records now in the dataset (the first-run default and the words of Undo import). */
  recordCount(): number;
  /** A live record's name for a conflict row; undefined when it has none (the row then shows its ID). */
  nameOf(ref: RecordRef): string | undefined;
  readonly log: (type: string, message: string) => void;
}
