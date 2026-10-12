/**
 * The words of the export screen (step 5.9b): what each format, scope and image choice means, the file name made safe, the progress
 * and the result in plain language. Nothing here decides anything; it says what the flows answered. No internal name is shown.
 */
import type { ExportResult } from '@/io';
import { RECORD_KINDS, type RecordRef } from '@/core/schema';
import type { ExportFormatId, ExportReply } from './export-contracts';
import { plainEngineText, shownMessage, shownName } from './words';

export type ExportScopeId = 'full' | 'chemistry' | 'curriculum' | 'presentation';
export type ImagesChoice = 'none' | 'embed' | 'package';

export interface Choice<T extends string> {
  readonly id: T;
  readonly label: string;
  readonly text: string;
}

export const FORMATS: readonly Choice<ExportFormatId>[] = [
  { id: 'orn.json', label: 'One file (.orn.json)', text: 'A single text file with your data. Images, if you include them, are stored inside it. The simplest thing to keep and to share.' },
  { id: 'ornpkg', label: 'Package (.ornpkg)', text: 'A zip file with the data and every image as a separate file, each with a checksum. Best when there are many or large images.' },
];

/** What each scope includes, in words (PERSISTENCE §8). Every choice is complete: it never leaves a record pointing at something missing. */
export const SCOPES: readonly Choice<ExportScopeId>[] = [
  { id: 'full', label: 'Everything', text: 'All of it: the chemistry, the syllabus (exams and topics), the display settings and every attached image.' },
  { id: 'chemistry', label: 'Chemistry only', text: 'Substances, reagents, reactions, mechanisms, concepts and their notes, with the images attached to them. No syllabus and no display settings.' },
  { id: 'curriculum', label: 'Curriculum', text: 'The syllabus: exams, versions, topics and what each is mapped to, together with the chemistry records they point at, so the file imports cleanly.' },
  { id: 'presentation', label: 'Display settings', text: 'How things are shown: the family layout, the reaction schemes and the saved views, together with the chemistry they point at.' },
];

export const IMAGES: readonly Choice<ImagesChoice>[] = [
  { id: 'none', label: 'No images', text: 'Only the records. Image records are kept, but their pictures are not in the file.' },
  { id: 'embed', label: 'Inside the file', text: 'The pictures are written into the one file. Needs the one-file format.' },
  { id: 'package', label: 'In the package', text: 'The pictures are separate files in the zip. Needs the package format.' },
];

export const EXTENSION: Readonly<Record<ExportFormatId, string>> = { 'orn.json': '.orn.json', ornpkg: '.ornpkg' };
export const MIME: Readonly<Record<ExportFormatId, string>> = { 'orn.json': 'application/json', ornpkg: 'application/zip' };

/** The images choice that fits the format: "inside the file" belongs to the one file, "in the package" to the package. */
export const imagesFor = (images: ImagesChoice, format: ExportFormatId): ImagesChoice => (images === 'none' ? 'none' : format === 'orn.json' ? 'embed' : 'package');

/** Why an images choice cannot be used with the format; undefined: it can. */
export const imagesUnavailable = (images: ImagesChoice, format: ExportFormatId): string | undefined =>
  images === 'embed' && format !== 'orn.json' ? 'it needs the one-file format' : images === 'package' && format !== 'ornpkg' ? 'it needs the package format' : undefined;

export const sizeText = (bytes: number): string => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`);

export function imagesNote(info: { readonly count: number; readonly bytes: number }): string {
  if (info.count === 0) return 'This dataset holds no images.';
  return `This dataset holds ${info.count} image${info.count === 1 ? '' : 's'}, ${sizeText(info.bytes)} in all. A scope other than Everything takes only the images attached to what it includes.`;
}

const MAX_BASE = 80;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
export const FALLBACK_BASE = 'orn-dataset';

/** Any text as a file name base that every file system accepts: letters, digits, dot, dash, underscore; never a path, never empty. */
export function safeFileBase(text: string): string {
  let base = text.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  base = base
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/[-.]*-[-.]*/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  if (base.length > MAX_BASE) base = base.slice(0, MAX_BASE).replace(/[-.]+$/g, '');
  if (RESERVED.test(base.split('.')[0] ?? '')) base = `file-${base}`;
  return base === '' ? FALLBACK_BASE : base;
}

/** The name offered at first: the dataset title and today's date (the injected clock). */
export const defaultBase = (title: string, today: string): string => `${safeFileBase(title)}-${today}`;

/** The name the file will have: the base made safe, with the format's extension once (a typed ".orn.json" is not doubled). */
export function fileNameOf(base: string, format: ExportFormatId): string {
  const ext = EXTENSION[format];
  const trimmed = base.toLowerCase().endsWith(ext) ? base.slice(0, base.length - ext.length) : base;
  return `${safeFileBase(trimmed)}${ext}`;
}

export function progressWords(done: number, total: number | undefined, note: string | undefined): string {
  const images = total === undefined ? undefined : total - 1;
  if (note?.startsWith('asset ') === true) return images === undefined || images < 1 ? 'Adding an image' : `Adding image ${Math.min(done, images)} of ${images}`;
  if (note === 'zip') return 'Packing the files into the package';
  if (note === 'serialize') return 'Writing the file';
  return total === undefined ? 'Working' : `Step ${done} of ${total}`;
}

const REASON: Readonly<Record<string, string>> = { no_bytes: 'its picture is not stored on this device', read_failed: 'its picture could not be read' };
const MAX_LISTED = 20;

const kindText = (kind: string): string => kind.replaceAll('_', ' ');
const counted = (count: number, kind: string): string => {
  const name = kindText(kind);
  return `${count} ${count === 1 || name === 'species' ? name : name.endsWith('s') ? `${name}es` : `${name}s`}`;
};
const listed = (lines: readonly string[]): readonly string[] => (lines.length <= MAX_LISTED ? lines : [...lines.slice(0, MAX_LISTED), `and ${lines.length - MAX_LISTED} more, not listed here`]);

export function countsWords(counts: ExportResult['counts']): string {
  const parts = RECORD_KINDS.filter((kind) => (counts[kind] ?? 0) > 0).map((kind) => counted(counts[kind] ?? 0, kind));
  return parts.length === 0 ? 'no records' : parts.join(', ');
}

export interface Written {
  readonly fileName: string;
  readonly size: string;
  readonly counts: string;
  readonly total: number;
  readonly missingAssets: readonly string[];
  readonly missingReferences: readonly string[];
  readonly inProcess: boolean;
}

export function writtenOf(result: ExportResult, fileName: string, inProcess: boolean, nameOf: (ref: RecordRef) => string | undefined): Written {
  const nameFor = (ref: RecordRef): string => {
    const name = nameOf(ref);
    return `${kindText(ref.kind)} ${name === undefined ? ref.id : `${shownName(name)} (${ref.id})`}`;
  };
  const missingAssets = result.missingAssets.map(
    (asset) => `Image ${nameFor({ kind: 'asset', id: asset.assetId } as RecordRef)}: ${REASON[asset.reason ?? 'no_bytes'] ?? 'its picture is missing'}${asset.message === undefined ? '' : ` (${shownMessage(asset.message)})`}`,
  );
  const missingReferences = result.missingReferences.map(
    (ref) => `${nameFor(ref.from)} points at ${ref.targetKind === undefined ? 'a record' : kindText(ref.targetKind)} ${shownName(ref.targetId)}, which is not in the file`,
  );
  const total = RECORD_KINDS.reduce((sum, kind) => sum + (result.counts[kind] ?? 0), 0);
  return { fileName, size: sizeText(result.bytes.length), counts: countsWords(result.counts), total, missingAssets: listed(missingAssets), missingReferences: listed(missingReferences), inProcess };
}

export interface ExportRefusal {
  readonly title: string;
  readonly text: string;
}

/** What the export flow refused, in words. `inProcessAvailable` is offered by the screen, not taken here. */
export function exportRefusal(failure: Extract<ExportReply, { ok: false }>): ExportRefusal {
  const message = plainEngineText(failure.message);
  const why = message === '' ? '' : ` (${message})`;
  switch (failure.code) {
    case 'WORKER_DOWN':
      return {
        title: 'The background worker is down',
        text: `The worker that builds the file stopped${why}. Nothing was exported.${failure.inProcessAvailable === true ? ' The file can be built on this page instead; the page may freeze while it runs.' : ''}`,
      };
    case 'BUSY':
      return { title: 'Another operation is running', text: `Wait until it finishes, then export again${why}. Nothing was exported.` };
    case 'SERIALIZE_FAILED':
      return { title: 'The file could not be written', text: `The data could not be written to a file${why}. Nothing was exported.` };
    case 'REJECTED':
      return { title: 'The export did not run', text: `The code for the export could not be loaded${why}. Check the connection and try again. Nothing was exported.` };
    default:
      return { title: 'The export did not run', text: `${message === '' ? 'The export could not run.' : message} Nothing was exported. [${failure.code}]` };
  }
}
