/**
 * Step 3.11c: the preview and the full report of both legacy fixtures into both stores equal the COMMITTED expected outputs in
 * data/fixtures/legacy-expected/. This test only compares: the files are written by `node scripts/legacy-expected.mjs`, by hand,
 * with the reason recorded in docs/PROGRESS.md (see the README in that folder). A missing file is a failure too.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildLegacyExpected } from '@/test-support/legacy-expected';

const dir = new URL('../../data/fixtures/legacy-expected/', import.meta.url);
const committed = (name: string): string | undefined => (existsSync(new URL(name, dir)) ? readFileSync(new URL(name, dir), 'utf8').replace(/\r\n/g, '\n') : undefined);

describe('the committed expected outputs of the legacy dry run', async () => {
  const built = await buildLegacyExpected();

  it('there is exactly one committed file per produced output (and the README), no more, no less', () => {
    const files = readdirSync(dir).filter((f) => f !== 'README.md').sort();
    expect(files).toEqual([...built.keys()].sort());
    expect(built.size).toBe(8);
  });

  it.each([...built.keys()])('%s equals the committed file', (name) => {
    const expected = committed(name);
    expect(expected, `${name} is not committed: run node scripts/legacy-expected.mjs and record the reason in docs/PROGRESS.md`).toBeDefined();
    // one assertion on the whole text; a difference is reported by vitest's diff
    expect(built.get(name)).toBe(expected);
  });

  it('the previews and reports are deterministic: building them twice gives the same text', async () => {
    const again = await buildLegacyExpected();
    expect([...again]).toEqual([...built]);
  });

  it('each report file is the legacyReport of its preview file, and both fixtures have zero notImported', () => {
    for (const stem of ['v6-demo-export.empty', 'v6-demo-export.demo', 'v4-sample.empty', 'v4-sample.demo']) {
      const preview = JSON.parse(committed(`${stem}.preview.json`) as string) as { legacyReport: unknown; canConfirm: boolean; findingSummary: { error: number } };
      const report = JSON.parse(committed(`${stem}.report.json`) as string) as { notImported: unknown[] };
      expect(preview.legacyReport).toEqual(report);
      expect(report.notImported).toEqual([]);
      expect(preview.canConfirm).toBe(true);
      expect(preview.findingSummary.error).toBe(0);
    }
  });
});
