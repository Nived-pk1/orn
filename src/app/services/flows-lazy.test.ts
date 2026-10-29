/**
 * The import, restore and export services (and the io / compute-flow code under them) load on the first flow call, not with the first
 * paint (7.2b A1: room under the Studio line). The module that `create.ts` imports holds no service by value.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('flows are lazy', () => {
  const source = readFileSync(new URL('./flows.ts', import.meta.url), 'utf8');

  it('imports no service module by value', () => {
    const values = [...source.matchAll(/^import\s+(?!type\b)[^;]*from\s+'([^']+)'/gm)].map((m) => m[1]);
    expect(values.filter((from) => /import-service|restore-service|export-service|@\/io|@\/workers\/compute/.test(from ?? ''))).toEqual([]);
  });

  it('loads the services with a dynamic import', () => {
    expect(source).toMatch(/import\('\.\/flows-core'\)/);
  });
});
