/**
 * What the publish check does with a file (studio step E4): the SAME import pipeline as the app (parse, envelope, L1-L3, assets with magic
 * bytes and SHA-256) over an empty dataset, then a verdict. It refuses on a parse failure, a legacy file, any L1 ERROR (a record the file
 * lists that fails its schema, or an ERROR finding of the merged result), a rejected asset, a package entry it could not read, and picture
 * records with no bytes (a published picture must show to everyone). The fixtures are made by the test through the export builders.
 */
import { describe, expect, it } from 'vitest';
import { createIdFactory } from '@/core/dataset';
import { migrationRunner } from '@/core/migrations';
import type { CanonicalState } from '@/core/schema';
import { withSyntheticAssets } from '@/test-support/asset-kit';
import { demoState } from '@/test-support/app-boot-kit';
import { mulberry32 } from '@/test-support/command-kit';
import { exportBytes } from '@/test-support/import-kit';
import { emptyState } from '@/test-support/legacy-import-kit';
import { checkForPublish, type PublishVerdict } from './publish';

const deps = () => {
  const store = emptyState();
  return { store: { getState: (): CanonicalState => store, getRevision: () => 0 }, ids: createIdFactory({ nowMs: () => 1_790_000_000_000 }, { next: mulberry32(9) }), runner: migrationRunner };
};
const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
const bytesOf = (value: string): Uint8Array => new TextEncoder().encode(value);
const reasons = (verdict: PublishVerdict): string => (verdict.ok ? '' : verdict.reasons.join(' | '));

async function withPictures() {
  const base = demoState();
  const attachTo = (i: number) => ({ kind: 'mechanism' as const, id: Object.keys(base.records.mechanism).sort()[i % 2] as string });
  const made = await withSyntheticAssets(base, { count: 2, bytesEach: 96, attachTo });
  return { state: made.state, provider: async (id: string) => made.bytes.get(id) };
}

describe('checkForPublish: accepted', () => {
  it('a Studio export (.orn.json) of the demo: ok, with the counts, the record total and no ERROR', async () => {
    const verdict = await checkForPublish({ fileName: 'study.orn.json', bytes: await exportBytes(demoState()) }, deps());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.format).toBe('orn.dataset');
    expect(verdict.mergedRecordCount).toBe(Object.values(verdict.counts).reduce((sum, n) => sum + n, 0));
    expect(verdict.counts.species).toBe(Object.keys(demoState().records.species).length);
    expect(verdict.findingSummary.error).toBe(0);
  });

  it('an .orn.json with the pictures embedded, and an .ornpkg with the pictures inside: ok, the pictures counted', async () => {
    const { state, provider } = await withPictures();
    for (const [format, assets, fileName] of [['json', 'embed', 'study.orn.json'], ['pkg', 'package', 'study.ornpkg']] as const) {
      const verdict = await checkForPublish({ fileName, bytes: await exportBytes(state, format, assets, provider as never) }, deps());
      expect(verdict.ok, `${fileName}: ${reasons(verdict)}`).toBe(true);
      if (verdict.ok) {
        expect(verdict.counts.asset).toBe(2);
        expect(verdict.assets.withoutBytes).toBe(0);
      }
    }
  });
});

describe('checkForPublish: refused, in words, nothing written by the check', () => {
  it('an L1 ERROR: a record the file lists that fails its schema (the canonical name blanked)', async () => {
    const json = JSON.parse(text(await exportBytes(demoState()))) as { records: { species: { names: { canonical: string } }[] } };
    Object.assign(json.records.species[0]?.names ?? {}, { canonical: '' });
    const verdict = await checkForPublish({ fileName: 'broken.orn.json', bytes: bytesOf(JSON.stringify(json)) }, deps());
    expect(verdict.ok).toBe(false);
    expect(reasons(verdict)).toMatch(/failed validation|L1/);
  });

  it('a rejected asset: embedded bytes that do not match the record\'s SHA-256', async () => {
    const { state, provider } = await withPictures();
    const json = JSON.parse(text(await exportBytes(state, 'json', 'embed', provider as never))) as { embeddedAssets: { base64: string }[] };
    Object.assign(json.embeddedAssets[0] ?? {}, { base64: Buffer.from(new Uint8Array(96).fill(7)).toString('base64') });
    const verdict = await checkForPublish({ fileName: 'bad-asset.orn.json', bytes: bytesOf(JSON.stringify(json)) }, deps());
    expect(verdict.ok).toBe(false);
    expect(reasons(verdict)).toContain('rejected asset');
    expect(reasons(verdict)).toContain("do not match the record's SHA-256");
  });

  it('picture records with no bytes (exported without the pictures)', async () => {
    const { state } = await withPictures();
    const verdict = await checkForPublish({ fileName: 'no-bytes.orn.json', bytes: await exportBytes(state, 'json', 'none') }, deps());
    expect(verdict.ok).toBe(false);
    expect(reasons(verdict)).toContain('picture');
  });

  it('a file that is not a dataset, an older-app (legacy) file, and a file that is not JSON', async () => {
    expect(reasons(await checkForPublish({ fileName: 'x.json', bytes: bytesOf('{"nothing":true}') }, deps()))).not.toBe('');
    expect(reasons(await checkForPublish({ fileName: 'x.json', bytes: bytesOf('not json at all') }, deps()))).not.toBe('');
    const legacy = await checkForPublish({ fileName: 'v6.json', bytes: bytesOf(JSON.stringify({ version: 6, compounds: [], reactions: [] })) }, deps());
    expect(legacy.ok).toBe(false);
  });
});

describe('checkForPublish: the host serves at most 25 MiB per file (7.1b R7)', () => {
  const LIMIT = 26_214_400;
  const padded = async (size: number): Promise<Uint8Array> => {
    const base = await exportBytes(demoState());
    const out = new Uint8Array(size).fill(0x20); // JSON ignores trailing spaces
    out.set(base, 0);
    return out;
  };

  it('just under and exactly at the limit: not refused for size', async () => {
    for (const size of [LIMIT - 1, LIMIT]) {
      const verdict = await checkForPublish({ fileName: 'big.orn.json', bytes: await padded(size) }, deps());
      expect(reasons(verdict), String(size)).not.toContain('The host serves');
    }
  });

  it('just over the limit: refused in words before anything is read', async () => {
    const verdict = await checkForPublish({ fileName: 'big.orn.json', bytes: await padded(LIMIT + 1) }, deps());
    expect(verdict.ok).toBe(false);
    expect(reasons(verdict)).toBe('This file is 25.1 MB. The host serves at most 25 MB per file: publish fewer or smaller pictures.');
  });
});
