import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const script = resolve('scripts/check-hardcode.mjs');
const dirs: string[] = [];
function sandbox(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'orn-hardcode-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'data', 'seed'), { recursive: true });
  writeFileSync(join(dir, 'data', 'seed', 'x.json'), JSON.stringify([{ id: 'sub_zzz-one', name: 'Stereochemistry' }]));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}
const run = (cwd: string) => spawnSync(process.execPath, [script], { cwd, encoding: 'utf8' });
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('check:hardcode and the inspector labels module', () => {
  it('stops a dataset name in an ordinary file', () => {
    const r = run(sandbox({ 'src/features/inspector/other.ts': "export const a = 'Stereochemistry';\n" }));
    expect(r.status).toBe(1);
  });
  it('lets the labels module say a word that is also a dataset name', () => {
    const r = run(sandbox({ 'src/features/inspector/labels.ts': "export const a = 'Stereochemistry';\n" }));
    expect(r.status).toBe(0);
  });
  it('still catches a dataset ID in the labels module', () => {
    const r = run(sandbox({ 'src/features/inspector/labels.ts': "export const a = 'sub_zzz-one';\n" }));
    expect(r.status).toBe(1);
  });
  it('exempts only that path', () => {
    const r = run(sandbox({ 'src/features/inspector/labels.tsx': "export const a = 'Stereochemistry';\n", 'src/features/other/labels.ts': "export const a = 'Stereochemistry';\n" }));
    expect(r.status).toBe(1);
  });
});
