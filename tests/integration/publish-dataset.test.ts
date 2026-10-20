/**
 * `npm run publish:dataset -- <file>` (scripts/publish-dataset.mjs, studio step E4), run as a real process over fixtures the test makes
 * with the export builders: it accepts a valid file and writes data/published/ (the file and a manifest with sha256, publishedAt from an
 * injected clock, and the counts); it refuses an L1 ERROR, a rejected asset and a missing file, and then writes nothing; the manifest is
 * deterministic. Nothing is published for real: every run writes into a temporary folder (ORN_PUBLISH_DIR).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { demoState } from '@/test-support/app-boot-kit';
import { withSyntheticAssets } from '@/test-support/asset-kit';
import { exportBytes } from '@/test-support/import-kit';

const SCRIPT = fileURLToPath(new URL('../../scripts/publish-dataset.mjs', import.meta.url));
const NOW = '2026-10-21T09:30:00.000Z';
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

let valid: Uint8Array;
let withPictures: Uint8Array;
let brokenL1: Uint8Array;
let badAsset: Uint8Array;
let valid2: Uint8Array;
beforeAll(async () => {
  valid = await exportBytes(demoState());
  const base = demoState();
  const mechanism = Object.keys(base.records.mechanism).sort()[0] as string;
  const made = await withSyntheticAssets(base, { count: 1, bytesEach: 64, attachTo: () => ({ kind: 'mechanism', id: mechanism }) });
  const provider = async (id: string) => made.bytes.get(id);
  withPictures = await exportBytes(made.state, 'json', 'embed', provider as never);
  const pkg = JSON.parse(new TextDecoder().decode(valid)) as { records: { species: { names: { canonical: string } }[] } };
  Object.assign(pkg.records.species[0]?.names ?? {}, { canonical: '' });
  brokenL1 = new TextEncoder().encode(JSON.stringify(pkg));
  const bad = JSON.parse(new TextDecoder().decode(withPictures)) as { embeddedAssets: { base64: string }[] };
  Object.assign(bad.embeddedAssets[0] ?? {}, { base64: Buffer.from(new Uint8Array(64).fill(3)).toString('base64') });
  badAsset = new TextEncoder().encode(JSON.stringify(bad));
  valid2 = await exportBytes(demoState(), 'pkg');
});

function run(bytes: Uint8Array | null, over: { name?: string; args?: string[]; out?: string; now?: string } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'orn-publish-'));
  dirs.push(root);
  const file = join(root, over.name ?? 'study.orn.json');
  if (bytes !== null) writeFileSync(file, bytes);
  const out = over.out ?? join(root, 'published');
  const result = spawnSync(process.execPath, [SCRIPT, ...(over.args ?? [file])], { encoding: 'utf8', env: { ...process.env, ORN_NOW: over.now ?? NOW, ORN_PUBLISH_DIR: out } });
  return { status: result.status, out: result.stdout + result.stderr, dir: out, file };
}
const files = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).sort() : []);
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

describe('scripts/publish-dataset.mjs', () => {
  it('accepts a valid file: prints counts and findings, copies it to the folder with a manifest', () => {
    const { status, out, dir } = run(valid);
    expect(status, out).toBe(0);
    expect(out).toContain('publish: accepted');
    expect(out).toMatch(/species\s+\d+/);
    expect(files(dir)).toEqual(['dataset.orn.json', 'manifest.json']);
    expect(sha(readFileSync(join(dir, 'dataset.orn.json')))).toBe(sha(valid));
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Record<string, unknown>;
    expect(manifest).toMatchObject({ manifestVersion: 1, file: 'dataset.orn.json', format: 'orn.dataset', sha256: sha(valid), bytes: valid.length, publishedAt: NOW });
    expect((manifest.recordCounts as Record<string, number>).species).toBe(Object.keys(demoState().records.species).length);
    expect(manifest.recordTotal).toBe(Object.values(manifest.recordCounts as Record<string, number>).reduce((a, b) => a + b, 0));
  });

  it('the manifest is deterministic: the same file and the same injected clock give the same bytes; another clock changes only publishedAt', () => {
    const a = run(valid);
    const b = run(valid);
    expect(readFileSync(join(a.dir, 'manifest.json'), 'utf8')).toBe(readFileSync(join(b.dir, 'manifest.json'), 'utf8'));
    const later = run(valid, { now: '2027-01-02T03:04:05.000Z' });
    const first = JSON.parse(readFileSync(join(a.dir, 'manifest.json'), 'utf8')) as Record<string, unknown>;
    const second = JSON.parse(readFileSync(join(later.dir, 'manifest.json'), 'utf8')) as Record<string, unknown>;
    expect({ ...second, publishedAt: first.publishedAt }).toEqual(first);
    expect(second.publishedAt).toBe('2027-01-02T03:04:05.000Z');
  });

  it('accepts pictures embedded in the file, and a package (.ornpkg: the file takes the format\'s own name)', () => {
    const pictures = run(withPictures);
    expect(pictures.status, pictures.out).toBe(0);
    expect(JSON.parse(readFileSync(join(pictures.dir, 'manifest.json'), 'utf8')).recordCounts.asset).toBe(1);
    const pkg = run(valid2, { name: 'study.ornpkg' });
    expect(pkg.status, pkg.out).toBe(0);
    expect(files(pkg.dir)).toEqual(['dataset.ornpkg', 'manifest.json']);
    expect(JSON.parse(readFileSync(join(pkg.dir, 'manifest.json'), 'utf8')).format).toBe('orn.package');
  });

  it('publishing a package after a .orn.json leaves only the new dataset file in the folder', () => {
    const first = run(valid);
    const second = run(valid2, { name: 'study.ornpkg', out: first.dir });
    expect(second.status, second.out).toBe(0);
    expect(files(first.dir)).toEqual(['dataset.ornpkg', 'manifest.json']);
  });

  it('REFUSES an L1 ERROR: exit 1, the reason in words, nothing written', () => {
    const { status, out, dir } = run(brokenL1);
    expect(status).toBe(1);
    expect(out).toContain('publish: refused');
    expect(out).toMatch(/failed validation|L1/);
    expect(files(dir)).toEqual([]);
  });

  it('REFUSES a rejected asset: exit 1, nothing written', () => {
    const { status, out, dir } = run(badAsset);
    expect(status).toBe(1);
    expect(out).toContain('rejected asset');
    expect(files(dir)).toEqual([]);
  });

  it('REFUSES a missing file and a call with no file: nothing written', () => {
    const missing = run(null);
    expect(missing.status).toBe(1);
    expect(missing.out).toContain('publish: cannot read');
    expect(files(missing.dir)).toEqual([]);
    const none = run(valid, { args: [] });
    expect(none.status).toBe(2);
    expect(none.out).toContain('usage: npm run publish:dataset -- <file>');
  });

  it('a refusal leaves a previously published dataset exactly as it was', () => {
    const ok = run(valid);
    const before = readFileSync(join(ok.dir, 'manifest.json'), 'utf8');
    const refused = run(brokenL1, { out: ok.dir });
    expect(refused.status).toBe(1);
    expect(readFileSync(join(ok.dir, 'manifest.json'), 'utf8')).toBe(before);
    expect(files(ok.dir)).toEqual(['dataset.orn.json', 'manifest.json']);
  });
});
