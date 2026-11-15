/**
 * The publish check (studio step E4, ADR-041): is this file fit to be THE dataset of the public Study site? It runs the same import
 * pipeline as the app (`parseImportSource`, then a `replace_all` preview over an empty dataset: envelope, migrations, L1 per record,
 * L1-L3 over the merged result, assets with magic bytes and SHA-256) and decides. No file, clock or network here: the caller (the Node
 * script `scripts/publish-dataset.mjs`) reads the file and writes the result. Nothing is silent: every refusal says why.
 *
 * Refused: a file the parser rejects; an older-app (legacy) file (export from Studio instead); a preview that cannot be built or cannot be
 * confirmed (an L1-L3 ERROR); any record the file lists that failed its schema; any ERROR finding; a rejected asset; a package entry that
 * could not be read; picture records with no bytes (a published picture must show to everyone); a file over 25 MiB (the host's limit);
 * and (step 8.4s) any record whose review status is not `verified`, unless the caller passes the EXACT count as `allowUnreviewed`.
 */
import type { IdFactory } from '@/core/dataset/contracts';
import type { MigrationRunner } from '@/core/migrations';
import type { CanonicalState, RecordKind } from '@/core/schema';
import type { Finding } from '@/core/validation';
import type { ImportAssetSummary, ImportFormat, FindingSummary } from './contracts';
import { createImportSession } from './import-session';
import { parseImportSource } from './import-source';

export interface PublishDeps {
  /** An EMPTY dataset: what the visitor's browser holds when it loads the published file. */
  readonly store: { getState(): CanonicalState; getRevision(): number };
  readonly ids: IdFactory;
  readonly runner: MigrationRunner;
}

/** Step 8.4s (S7): the caller says how many unreviewed records it accepts (the script's `--allow-unreviewed N`); it must be the exact count. */
export interface PublishOptions {
  readonly allowUnreviewed?: number;
}

/** Records whose review status is not `verified`, per kind (a kind with none is absent), and in all. Read from whatever the records say: no kind, name or ID is listed here. */
export interface UnreviewedCount {
  readonly total: number;
  readonly byKind: Readonly<Partial<Record<RecordKind, number>>>;
}

export function countUnreviewed(records: Readonly<Partial<Record<RecordKind, readonly unknown[] | undefined>>>): UnreviewedCount {
  const byKind: Partial<Record<RecordKind, number>> = {};
  let total = 0;
  for (const [kind, list] of Object.entries(records)) {
    let count = 0;
    for (const record of list ?? []) {
      const review = typeof record === 'object' && record !== null ? (record as { review?: unknown }).review : undefined;
      if (typeof review !== 'object' || review === null) continue; // a kind that carries no review status
      if ((review as { status?: unknown }).status !== 'verified') count += 1;
    }
    if (count > 0) byKind[kind as RecordKind] = count;
    total += count;
  }
  return { total, byKind };
}

export interface PublishInput {
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

/** The host (Cloudflare) serves at most 25 MiB per static file; a larger file would publish and then fail at deploy. */
export const MAX_PUBLISH_BYTES = 26_214_400;

/** The findings listed in a verdict (errors first, then the rest, as the preview lists them), bounded. */
const MAX_LISTED_FINDINGS = 50;

export type PublishVerdict =
  | {
      readonly ok: true;
      readonly format: ImportFormat;
      readonly counts: Readonly<Partial<Record<RecordKind, number>>>;
      readonly mergedRecordCount: number;
      readonly findingSummary: FindingSummary;
      readonly findings: readonly Finding[];
      readonly assets: ImportAssetSummary;
      /** Printed every time, accepted or not. */
      readonly unreviewed: UnreviewedCount;
    }
  | { readonly ok: false; readonly reasons: readonly string[]; readonly findings: readonly Finding[]; readonly unreviewed?: UnreviewedCount };

const refuse = (reasons: readonly string[], findings: readonly Finding[] = [], unreviewed?: UnreviewedCount): PublishVerdict => ({
  ok: false,
  reasons,
  findings: findings.slice(0, MAX_LISTED_FINDINGS),
  ...(unreviewed === undefined ? {} : { unreviewed }),
});

const kindsText = (count: UnreviewedCount): string =>
  Object.entries(count.byKind)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, n]) => `${kind} ${n}`)
    .join(', ');

export async function checkForPublish(input: PublishInput, deps: PublishDeps, options: PublishOptions = {}): Promise<PublishVerdict> {
  if (input.bytes.byteLength > MAX_PUBLISH_BYTES) {
    const megabytes = (Math.ceil((input.bytes.byteLength / 1_048_576) * 10) / 10).toFixed(1);
    return refuse([`This file is ${megabytes} MB. The host serves at most 25 MB per file: publish fewer or smaller pictures.`]);
  }
  const parsed = await parseImportSource({ fileName: input.fileName, bytes: new Blob([input.bytes as BlobPart]) }, { runner: deps.runner });
  if (!parsed.ok) return refuse([`the file was not read (${parsed.code}): ${parsed.message}`]);
  const result = parsed.result;
  if (result.format !== 'orn.dataset' && result.format !== 'orn.package') {
    return refuse([`this is an older-app (${result.format}) file: import it in Studio, then export from there`]);
  }
  const reasons: string[] = [];
  for (const item of result.quarantined) reasons.push(`a record failed validation (L1): ${item.claimedKind ?? 'unknown kind'} ${item.claimedId ?? ''}: ${item.issues.join('; ')}`.replace(/\s+:/, ':'));
  for (const rejected of result.rejectedAssets) reasons.push(`rejected asset ${rejected.assetId ?? rejected.sha256}: ${rejected.reason}`);
  for (const issue of result.packageIssues) reasons.push(`rejected asset: package entry ${issue.path}: ${issue.reason}`);

  const session = createImportSession({ store: deps.store, ids: deps.ids });
  const outcome = await session.preview({ parsed: result, fileName: input.fileName, request: { mode: 'replace_all' } });
  if (!outcome.ok) return refuse([...reasons, `the preview could not be built (${outcome.code}): ${outcome.message}`]);
  const preview = outcome.plan.preview;
  session.cancel(preview.batchId);
  if (!preview.canConfirm) reasons.push(...preview.blockers.map((blocker) => `blocked: ${blocker}`));
  if (preview.findingSummary.error > 0) reasons.push(`${preview.findingSummary.error} ERROR finding(s) in the merged result (L1-L3)`);
  if (preview.assets.withoutBytes > 0) reasons.push(`${preview.assets.withoutBytes} picture record(s) have no bytes in the file: export with the pictures "Inside the file" (or as a package)`);
  // the review gate (step 8.4s, S7): chemistry nobody verified is not published by accident
  const unreviewed = countUnreviewed(result.records);
  if (unreviewed.total > 0 && options.allowUnreviewed === undefined) {
    reasons.push(`${unreviewed.total} record(s) are not verified (${kindsText(unreviewed)}): verify them in Studio, or run again with --allow-unreviewed ${unreviewed.total} to publish them as they are`);
  } else if (options.allowUnreviewed !== undefined && options.allowUnreviewed !== unreviewed.total) {
    reasons.push(`--allow-unreviewed ${options.allowUnreviewed} does not match the ${unreviewed.total} unverified record(s) in this file${unreviewed.total === 0 ? '' : ` (${kindsText(unreviewed)})`}: give the exact count`);
  }
  if (reasons.length > 0) return refuse(reasons, preview.findings, unreviewed);

  const counts: Partial<Record<RecordKind, number>> = {};
  for (const [kind, entry] of Object.entries(preview.counts)) if (entry !== undefined && entry.incoming > 0) counts[kind as RecordKind] = entry.incoming;
  return { ok: true, format: result.format, counts, mergedRecordCount: preview.mergedRecordCount, findingSummary: preview.findingSummary, findings: preview.findings.slice(0, MAX_LISTED_FINDINGS), assets: preview.assets, unreviewed };
}
