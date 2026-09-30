/**
 * The expected outputs of the legacy dry run (step 3.11c): for each legacy fixture and each live store (empty, the demo dataset) the
 * preview and the full report, with a fixed clock and a fixed ID source, as deterministic JSON (keys sorted, two-space indent).
 * `scripts/legacy-expected.mjs` writes them to `data/fixtures/legacy-expected/` (by hand, on purpose); the test only COMPARES with
 * what is committed and never writes. Shared by the script and the test so they cannot disagree about what is produced.
 */
import { canonicalJson } from '@/io';
import { legacyBytes, legacyPreview, LEGACY_FIXTURES, type StoreKind } from './legacy-import-kit';

const STORES: readonly StoreKind[] = ['empty', 'demo'];
const pretty = (value: unknown): string => `${JSON.stringify(JSON.parse(canonicalJson(value) as string), null, 2)}\n`;

/** file name (inside `data/fixtures/legacy-expected/`) → text. */
export async function buildLegacyExpected(): Promise<ReadonlyMap<string, string>> {
  const files = new Map<string, string>();
  for (const name of LEGACY_FIXTURES) {
    for (const kind of STORES) {
      const run = await legacyPreview(legacyBytes(name), kind);
      if (!run.outcome.ok) throw new Error(`${name} into the ${kind} store: preview refused (${run.outcome.code}: ${run.outcome.message})`);
      const { preview } = run.outcome.plan;
      const stem = `${name.replace(/\.json$/, '')}.${kind}`;
      files.set(`${stem}.preview.json`, pretty(preview));
      files.set(`${stem}.report.json`, pretty(preview.legacyReport));
    }
  }
  return files;
}
