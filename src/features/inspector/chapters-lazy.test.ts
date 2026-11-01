/**
 * The chapter code is not in the first paint (7.3c A1: room under the Studio line). The inspector loads its "In chapters" line with a
 * dynamic import, and the persisted Chapters state needs only the group keys, never the chapter index or the list code.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const valueImports = (source: string): string[] => [...source.matchAll(/^import\s+(?!type\b)[^;]*from\s+'([^']+)'/gm)].map((m) => m[1] ?? '');

describe('chapters are lazy', () => {
  const inspector = readFileSync(new URL('./inspector.tsx', import.meta.url), 'utf8');
  const state = readFileSync(new URL('../../ui/state/chapters-state.ts', import.meta.url), 'utf8');

  it('the inspector imports neither in-chapters nor the chapters core by value', () => {
    expect(valueImports(inspector).filter((from) => /in-chapters|core\/chapters/.test(from))).toEqual([]);
  });

  it('the inspector loads the line with a dynamic import', () => {
    expect(inspector).toMatch(/import\('\.\/in-chapters'\)/);
  });

  it('the Chapters state imports only the group keys from the core', () => {
    const fromCore = valueImports(state).filter((from) => /core\/chapters/.test(from));
    expect(fromCore).toEqual(['@/core/chapters/group-keys']);
  });
});

describe('the editing core reaches the chapters core by deep imports (the barrel pulls the list code into the first paint)', () => {
  it('review-groups imports no chapters barrel', () => {
    const source = readFileSync(new URL('../../core/editing/review-groups.ts', import.meta.url), 'utf8');
    expect(valueImports(source).filter((from) => /(^|\/)chapters$/.test(from))).toEqual([]);
  });
});
