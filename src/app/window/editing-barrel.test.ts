/**
 * The first paint does not carry the draft machinery (7.3c A1): a module that is in the first load reaches `core/editing` by deep imports. The
 * barrel's static path would pull blank, session and stored into the first chunk although only the lazy draft manager uses them.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const valueImports = (source: string): string[] => [...source.matchAll(/^import\s+(?!type\b)[^;]*from\s+'([^']+)'/gm)].map((m) => m[1] ?? '');

describe('modules of the first load use no editing barrel', () => {
  it.each(['editors-controller.tsx', '../../features/inspector/view-pictures.tsx', '../../features/reaction-explorer/model.ts'])('%s', (file) => {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
    expect(valueImports(source).filter((from) => from === '@/core/editing')).toEqual([]);
  });
});

describe('the services of the first load reach the compute worker code by deep imports (the barrel pulls the import code into the first paint)', () => {
  it('replica.ts imports no compute barrel', () => {
    const source = readFileSync(new URL('../services/replica.ts', import.meta.url), 'utf8');
    expect(valueImports(source).filter((from) => from === '@/workers/compute')).toEqual([]);
  });
});
