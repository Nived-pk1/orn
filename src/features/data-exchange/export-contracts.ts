/**
 * The ONE interface the export screen needs from outside (step 5.9b): run an export (the flow of the app services), the dataset's
 * title and today's date (the injected clock) for the file name, what images the dataset holds, the names of live records, why an
 * export cannot start now, and how a finished file is saved. `src/app` fills it; the feature imports no `src/app` and no other feature.
 * The answers are structural (a failure is `{ ok: false, code, message }`), so the services' answers fit as they are.
 */
import type { ExportOptions, ExportResult } from '@/io';
import type { RecordRef } from '@/core/schema';

export type ExportFormatId = 'orn.json' | 'ornpkg';

export interface ExportFailure {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
  /** The compute worker is down and this thread can build the file instead (asked for, never taken silently). */
  readonly inProcessAvailable?: true;
  readonly busyWith?: string;
}

export type ExportReply = { readonly ok: true; readonly result: ExportResult; readonly inProcess: boolean } | ExportFailure;

export interface ExportRunOptions {
  readonly signal?: AbortSignal;
  readonly inProcess?: boolean;
  readonly onProgress?: (done: number, total?: number, note?: string) => void;
}

export interface ImageInfo {
  /** Asset records in the dataset. */
  readonly count: number;
  /** Their sizes added up, as the records state them. */
  readonly bytes: number;
}

export interface ExportPorts {
  run(options: ExportOptions, format: ExportFormatId, flow: ExportRunOptions): Promise<ExportReply>;
  /** The dataset's title (any text; the file name is made safe from it). */
  datasetTitle(): string;
  /** Today as `YYYY-MM-DD`, from the injected clock. */
  today(): string;
  images(): ImageInfo;
  /** A live record's name; undefined when it has none. */
  nameOf(ref: RecordRef): string | undefined;
  /** Why an export cannot start now (another operation is running); undefined: it can. Export works in every tab mode. */
  unavailable(): string | undefined;
  /** Saves a finished file (an anchor with `download`; the object URL is revoked after). */
  save(blob: Blob, fileName: string): void;
  readonly log: (type: string, message: string) => void;
}
