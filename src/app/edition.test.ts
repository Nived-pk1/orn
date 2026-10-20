/**
 * The edition constant (studio step, ADR-041): `__ORN_EDITION__` is a build-time literal; anything but 'studio' is the public Study
 * edition (a wrong value can never switch editing on). The tests run as Studio (vitest.config.ts), so every editor test is unchanged.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

async function loadAs(edition: string) {
  vi.resetModules();
  vi.stubGlobal('__ORN_EDITION__', edition);
  return import('./edition');
}

describe('edition', () => {
  it('the unit tests run as Studio', async () => {
    const { EDITION, EDITING } = await import('./edition');
    expect(EDITION).toBe('studio');
    expect(EDITING).toBe(true);
  });

  it('study: no editing', async () => {
    const { EDITION, EDITING } = await loadAs('study');
    expect(EDITION).toBe('study');
    expect(EDITING).toBe(false);
  });

  it('anything that is not exactly "studio" is the Study edition', async () => {
    for (const odd of ['', 'Studio', 'studio ', 'edit', 'undefined']) {
      const { EDITION, EDITING } = await loadAs(odd);
      expect(EDITION, odd).toBe('study');
      expect(EDITING, odd).toBe(false);
    }
  });

  it('no literal at all (a Node script or a test runner that loads src without the build) is Study, not a crash', async () => {
    vi.resetModules();
    const had = Object.getOwnPropertyDescriptor(globalThis, '__ORN_EDITION__');
    delete (globalThis as Record<string, unknown>).__ORN_EDITION__; // not declared at all
    try {
      const { EDITION, EDITING } = await import('./edition');
      expect(EDITION).toBe('study');
      expect(EDITING).toBe(false);
    } finally {
      if (had !== undefined) Object.defineProperty(globalThis, '__ORN_EDITION__', had);
    }
  });

  it('the word "Studio" comes from one constant, and the Studio page title is "ORN " plus it', async () => {
    const { STUDIO_NAME, pageTitleOf, SITE_TITLE } = await loadAs('studio');
    expect(STUDIO_NAME).toBe('Studio');
    expect(SITE_TITLE).toBe('Organic Reaction Navigator');
    expect(pageTitleOf()).toBe('ORN Studio');
    const study = await loadAs('study');
    expect(study.pageTitleOf()).toBe('Organic Reaction Navigator');
  });
});
