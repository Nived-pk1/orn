import { describe, expect, it } from 'vitest';
import { detectFormat, looksLikeZip } from './format-detect';

describe('looksLikeZip', () => {
  it('recognises the zip local-file-header signature', () => {
    expect(looksLikeZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
  });
  it('recognises the empty-archive and spanned-archive signatures', () => {
    expect(looksLikeZip(new Uint8Array([0x50, 0x4b, 0x05, 0x06]))).toBe(true);
    expect(looksLikeZip(new Uint8Array([0x50, 0x4b, 0x07, 0x08]))).toBe(true);
  });
  it('rejects plain JSON text and short buffers', () => {
    expect(looksLikeZip(new TextEncoder().encode('{"format"'))).toBe(false);
    expect(looksLikeZip(new Uint8Array([0x50, 0x4b]))).toBe(false);
  });
});

describe('detectFormat', () => {
  it('recognises orn.dataset', () => {
    expect(detectFormat({ format: 'orn.dataset', schemaVersion: 1, records: {} })).toEqual({ ok: true, format: 'orn.dataset' });
  });

  it('recognises a v6 export (MIGRATION.md §4.1)', () => {
    expect(detectFormat({ compounds: [], reactions: [{ id: 'r1' }], schemaVersion: 5 })).toEqual({ ok: true, format: 'legacy_v6' });
  });

  it('recognises v4 data: a reaction with no participants array (MIGRATION.md §4.1)', () => {
    const v4 = { reactions: [{ id: 'r1', start: 'a', end: 'b', reagent: 'x' }] };
    expect(detectFormat(v4)).toEqual({ ok: true, format: 'legacy_v4' });
  });

  it('does not mistake a v6 export for v4 (schemaVersion: 5 is checked first)', () => {
    const v6 = { compounds: [], reactions: [{ id: 'r1', participants: [] }], schemaVersion: 5 };
    expect(detectFormat(v6)).toEqual({ ok: true, format: 'legacy_v6' });
  });

  it('refuses an unrecognised shape with a reason, never a guess', () => {
    const result = detectFormat({ some: 'random', object: true });
    expect(result).toMatchObject({ ok: false, reason: expect.any(String) });
  });

  it('refuses a top-level array or scalar', () => {
    expect(detectFormat([1, 2, 3])).toMatchObject({ ok: false });
    expect(detectFormat('just a string')).toMatchObject({ ok: false });
    expect(detectFormat(null)).toMatchObject({ ok: false });
  });

  it('a reactions array with every item already having participants is not mistaken for v4', () => {
    const notV4 = { reactions: [{ id: 'r1', participants: [] }] };
    expect(detectFormat(notV4)).toMatchObject({ ok: false });
  });
});
