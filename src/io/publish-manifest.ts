/**
 * The manifest `npm run publish:dataset` writes beside the published dataset (docs/RELEASE.md "Publishing a dataset"): pure, so the same
 * file and the same injected clock always give the same bytes, and a test can check that in process. The hash is given (Node's crypto
 * lives in the script, not in `src/io`).
 */
import type { ImportFormat } from './contracts';

export interface ManifestSource {
  readonly format: ImportFormat;
  readonly counts: Readonly<Partial<Record<string, number>>>;
  readonly mergedRecordCount: number;
}

export interface PublishManifest {
  readonly manifestVersion: 1;
  readonly file: string;
  readonly format: ImportFormat;
  readonly sha256: string;
  readonly bytes: number;
  readonly publishedAt: string;
  readonly recordTotal: number;
  readonly recordCounts: Readonly<Record<string, number>>;
}

/** The published file's own name for a format. */
export const publishedFileName = (format: ImportFormat): string => (format === 'orn.package' ? 'dataset.ornpkg' : 'dataset.orn.json');

export function manifestOf(source: ManifestSource, bytes: Uint8Array, sha256: string, publishedAt: string): PublishManifest {
  const kinds = Object.keys(source.counts).sort();
  return {
    manifestVersion: 1,
    file: publishedFileName(source.format),
    format: source.format,
    sha256,
    bytes: bytes.length,
    publishedAt,
    recordTotal: source.mergedRecordCount,
    recordCounts: Object.fromEntries(kinds.map((kind) => [kind, source.counts[kind] ?? 0])),
  };
}
