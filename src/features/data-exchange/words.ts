/**
 * The words of the import screen: every refusal, stage and result in plain language. A code is kept visible (in brackets) so a
 * report can name it, but the sentence never depends on it. Nothing here decides anything; it only says what the flows answered.
 */
import { IMPORT_LIMITS, type ImportFormat } from '@/io/contracts';
import type { FlowFailure } from './contracts';

const MB = 1024 * 1024;
const mb = (bytes: number): string => `${Math.round((bytes / MB) * 10) / 10} MB`;
const num = (value: number): string => value.toLocaleString('en-US');

/** The longest file name shown in full; a longer one is cut with "…" and the full name stays in the tooltip. */
export const FILE_NAME_SHOWN = 120;

/** Text from a file as plain text: control and direction-changing characters are made visible, a long text is cut with "…". Never markup. */
export function plainText(value: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  const plain = value.replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

export const shownName = (name: string): string => plainText(name, FILE_NAME_SHOWN);
/** A message, issue or reason that came from a file or an engine. */
export const shownMessage = (text: string): string => plainText(text, 400);

export const formatWords = (format: ImportFormat): string =>
  format === 'orn.dataset' ? 'ORN dataset' : format === 'orn.package' ? 'ORN package' : format === 'legacy_v6' ? 'legacy v6 export' : 'legacy v4 file';

export const modeWords = (mode: 'replace_all' | 'merge'): string =>
  mode === 'merge' ? 'the file is added to what you have; where a record exists in both, you choose.' : 'replaces everything you have with the file; Undo import brings it back.';

export interface Refusal {
  readonly title: string;
  readonly text: string;
}

const sizeOf = (detail: FlowFailure['detail']): string => {
  const size = detail?.size;
  const cap = detail?.cap;
  return typeof size === 'number' && typeof cap === 'number' ? ` The file is ${mb(size)}; the limit is ${mb(cap)}.` : '';
};

/** What the flows refused, in words. `fileName` is shown by the caller as text, not here. */
export function refusalWords(failure: FlowFailure): Refusal {
  const { code, message, detail } = failure;
  const caps = `${mb(IMPORT_LIMITS.maxJsonBytes)} for a dataset file and ${mb(IMPORT_LIMITS.maxPackageBytes)} for a package`;
  switch (code) {
    case 'FILE_TOO_LARGE':
      return { title: 'The file is too large', text: `This file is bigger than the app accepts (${caps}).${sizeOf(detail)} Nothing was imported.` };
    case 'TOO_DEEP':
      return { title: 'The file is nested too deeply', text: `Its JSON is nested more than ${IMPORT_LIMITS.maxJsonDepth} levels deep, which no ORN file is. It was refused before it was read further. Nothing was imported.` };
    case 'STRING_TOO_LONG':
      return { title: 'The file has a text that is too long', text: `One text in the file is longer than ${num(IMPORT_LIMITS.maxStringLength)} characters. Nothing was imported.` };
    case 'TOO_MANY_RECORDS':
      return { title: 'The file has too many records', text: `It lists more than ${num(IMPORT_LIMITS.maxRecords)} records, the most one import accepts. Split it and import the parts one at a time. Nothing was imported.` };
    case 'INVALID_JSON':
      return { title: 'This is not a JSON file or a package', text: `The file is not valid JSON and not an ORN package (.ornpkg). Choose an ORN export, a package, or an export from the older app. Nothing was imported. (${message})` };
    case 'INVALID_ENVELOPE':
      return { title: 'The file is not shaped like an ORN file', text: `It is JSON, but it does not have the structure of an ORN dataset. Nothing was imported. (${message})` };
    case 'UNKNOWN_FORMAT':
      return { title: 'The format is not recognised', text: `This is not an ORN dataset, an ORN package, or an export of the older app (v6 or v4). Nothing was imported. (${message})` };
    case 'NEWER_SCHEMA':
      return { title: 'Saved by a newer version of the app', text: `This file was saved by a newer version of the app, whose data format this version cannot read safely. Nothing was imported. Open the file in the newer version, or export it again from the version that made it. (${message})` };
    case 'MIGRATION_FAILED':
      return { title: 'The file could not be brought up to date', text: `The file is from an older data format and its update steps failed. Nothing was imported. (${message})` };
    case 'PACKAGE_INVALID':
      return { title: 'The package is not valid', text: `The package could not be read as a whole (a missing or damaged part). Nothing was imported. (${message})` };
    case 'LEGACY_INVALID':
      return { title: 'The older file could not be converted', text: `The file looks like an export of the older app, but it could not be converted. Nothing was imported. (${message})` };
    case 'UNKNOWN_BATCH':
      return { title: 'The preview was lost', text: 'The preview was lost (the app restarted its background worker or the preview was replaced). Preview the file again. Nothing was imported.' };
    case 'STALE_REVISION':
      return { title: 'Your data changed since the preview', text: 'Your data changed since the preview, so it can no longer be applied as shown. Preview the file again. Nothing was imported.' };
    case 'INVALID_REQUEST':
      return { title: 'That choice cannot be used', text: `The last choice was refused, so the plan stays as it was. (${message})` };
    case 'INVALID_META':
      return { title: "The file's dataset information was refused", text: `The dataset information in the file (title, version) was not accepted. (${message})` };
    case 'BLOCKED':
      return { title: 'The import has errors', text: `The merged result has errors, so it cannot be applied. Fix them in the file or leave those records out. (${message})` };
    case 'PLAN_MISMATCH':
      return { title: 'The plan changed', text: 'What was confirmed is not what the preview now holds. Preview the file again. Nothing was imported.' };
    case 'READ_ONLY':
      return { title: 'This tab is read-only', text: `This tab cannot change the data (${message}). Use the writer tab. Nothing was imported.` };
    case 'BUSY':
      return { title: 'Another operation is running', text: `Wait until it finishes, then try again (${message}). Nothing was imported.` };
    case 'WORKER_DOWN':
      return { title: 'The background worker is not available', text: `The worker that reads the file is down (${message}).` };
    case 'SNAPSHOT_FAILED':
      return /quota/i.test(message)
        ? { title: 'There is no space for the safety copy', text: `The browser has no room left to save the snapshot that makes Undo import possible, so nothing was imported. Free up space or export a backup, then try again. (${message})` }
        : { title: 'The safety copy could not be made', text: `The snapshot that makes Undo import possible could not be saved, so nothing was imported. (${message})` };
    case 'REJECTED':
      return /quota/i.test(message)
        ? { title: 'There is no space to save', text: `The browser has no room left, so nothing was imported. Free up space or export a backup, then try again. (${message})` }
        : { title: 'The import was refused', text: `The data store refused the import, so nothing was imported. (${message})` };
    case 'CANCELLED':
      return { title: 'Cancelled', text: 'Cancelled. Nothing was changed.' };
    default:
      return { title: 'The import did not run', text: `${message} Nothing was imported. [${code}]` };
  }
}

/** The apply stages (`AppStatus.operation.stage`) in words. */
export function stageWords(stage: string | undefined): string {
  switch (stage) {
    case 'preparing':
      return 'Preparing the import';
    case 'snapshot':
      return 'Taking a snapshot so the import can be undone';
    case 'committing':
      return 'Applying the records';
    case 'saving':
      return 'Saving to this browser';
    default:
      return stage === undefined ? 'Working' : stage.charAt(0).toUpperCase() + stage.slice(1);
  }
}

/** Until the commit the apply can still be cancelled and changes nothing. */
export const cancellableStage = (stage: string | undefined): boolean => stage === undefined || stage === 'preparing' || stage === 'snapshot';

export interface ResultWords {
  /** The record counts, then how long the data takes to save. */
  readonly text: string;
  readonly kind: 'info' | 'warning';
}

/** "Imported N records" only once the data is saved; otherwise what is true instead. */
export function appliedWords(input: {
  readonly written: number;
  readonly skipped: number;
  readonly fileName: string;
  readonly saved: boolean;
  readonly sessionOnly: boolean;
  readonly saveError?: string | null;
}): ResultWords {
  const name = shownName(input.fileName);
  const skipped = input.skipped > 0 ? ` ${input.skipped} records were skipped (identical or kept as yours).` : '';
  if (input.sessionOnly) return { kind: 'warning', text: `Applied ${input.written} records from ${name}, not saved: nothing is stored in this tab. They are gone when the tab closes.${skipped}` };
  if (!input.saved) {
    const why = input.saveError === undefined || input.saveError === null ? '' : ` (${input.saveError})`;
    return { kind: 'warning', text: `Applied ${input.written} records from ${name}, but not saved yet${why}. The status line shows the save state.${skipped}` };
  }
  return { kind: 'info', text: `Imported ${input.written} records from ${name}.${skipped}` };
}
