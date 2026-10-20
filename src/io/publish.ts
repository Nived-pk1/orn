/**
 * The publish check (studio step E4, ADR-041): is this file fit to be THE dataset of the public Study site? It runs the same import
 * pipeline as the app (`parseImportSource`, then a `replace_all` preview over an empty dataset: envelope, migrations, L1 per record,
 * L1-L3 over the merged result, assets with magic bytes and SHA-256) and decides. No file, clock or network here: the caller (the Node
 * script `scripts/publish-dataset.mjs`) reads the file and writes the result. Nothing is silent: every refusal says why.
 *
 * Refused: a file the parser rejects; an older-app (legacy) file (export from Studio instead); a preview that cannot be built or cannot be
 * confirmed (an L1-L3 ERROR); any record the file lists that failed its schema; any ERROR finding; a rejected asset; a package entry that
 * could not be read; picture records with no bytes (a published picture must show to everyone).
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

export interface PublishInput {
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

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
    }
  | { readonly ok: false; readonly reasons: readonly string[]; readonly findings: readonly Finding[] };

const refuse = (reasons: readonly string[], findings: readonly Finding[] = []): PublishVerdict => ({ ok: false, reasons, findings: findings.slice(0, MAX_LISTED_FINDINGS) });

export async function checkForPublish(input: PublishInput, deps: PublishDeps): Promise<PublishVerdict> {
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
  if (reasons.length > 0) return refuse(reasons, preview.findings);

  const counts: Partial<Record<RecordKind, number>> = {};
  for (const [kind, entry] of Object.entries(preview.counts)) if (entry !== undefined && entry.incoming > 0) counts[kind as RecordKind] = entry.incoming;
  return { ok: true, format: result.format, counts, mergedRecordCount: preview.mergedRecordCount, findingSummary: preview.findingSummary, findings: preview.findings.slice(0, MAX_LISTED_FINDINGS), assets: preview.assets };
}
