/**
 * The legacy importer is a lazily loaded chunk (step 5.7): a legacy preview that cannot load it is a refusal in words (never a
 * thrown error, nothing changed), and the next preview tries again.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { legacyBytes, legacyPreview } from '@/test-support/legacy-import-kit';

afterEach(() => {
  vi.doUnmock('./import-legacy');
  vi.resetModules();
});

describe('the legacy importer chunk', () => {
  it('a chunk that fails to load is LEGACY_INVALID with a message in words, and a later preview loads it', async () => {
    vi.resetModules();
    let fails = true;
    vi.doMock('./import-legacy', () => {
      if (fails) throw new Error('Failed to fetch dynamically imported module');
      return vi.importActual('./import-legacy');
    });
    const kit = await import('@/test-support/legacy-import-kit');
    const first = await kit.legacyPreview(kit.legacyBytes('v4-sample.json'), 'empty');
    expect(first.outcome.ok).toBe(false);
    if (!first.outcome.ok) {
      expect(first.outcome.code).toBe('LEGACY_INVALID');
      expect(first.outcome.message).toMatch(/importer for older files could not be loaded/);
    }
    expect(first.store.getRevision()).toBe(1);
    fails = false;
    const second = await kit.legacyPreview(kit.legacyBytes('v4-sample.json'), 'empty');
    expect(second.outcome.ok).toBe(true);
  });

  it('a normal legacy preview still works through the dynamic import', async () => {
    const run = await legacyPreview(legacyBytes('v4-sample.json'), 'empty');
    expect(run.outcome.ok).toBe(true);
  });
});
