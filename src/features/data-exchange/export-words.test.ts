import { describe, expect, it } from 'vitest';
import type { ExportResult } from '@/io';
import { countsWords, defaultBase, exportRefusal, fileNameOf, imagesFor, progressWords, exportDefaults, notInFileLine, safeFileBase, scopeWords, SCOPES, writtenOf } from './export-words';

describe('the file name is made safe for a file system', () => {
  it('a plain title gives a readable name with the date of the injected clock', () => {
    expect(defaultBase('Organic Reaction Navigator demo', '2026-10-12')).toBe('Organic-Reaction-Navigator-demo-2026-10-12');
    expect(fileNameOf('mine-2026-10-12', 'orn.json')).toBe('mine-2026-10-12.orn.json');
    expect(fileNameOf('mine-2026-10-12', 'ornpkg')).toBe('mine-2026-10-12.ornpkg');
  });

  it('hostile titles never produce a path, a device name, markup, a control character or an empty name', () => {
    const hostile = [
      '../../etc/passwd',
      '..\\..\\Windows\\System32',
      '<script>alert(1)</script>',
      'CON',
      'nul.txt',
      'COM1',
      'a\u0000b\nc',
      '‮gnp.exe',
      '   ',
      '...',
      '/',
      'x'.repeat(500),
      '日本語のタイトル',
      'ünïcödé résumé',
      'name:with*bad?chars"|',
    ];
    for (const title of hostile) {
      const name = fileNameOf(defaultBase(title, '2026-10-12'), 'orn.json');
      expect(name).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*\.orn\.json$/);
      expect(name).not.toMatch(/\.\.|[\\/:*?"<>|]/);
      expect([...name].every((c) => c.charCodeAt(0) > 0x1f)).toBe(true);
      expect(name.length).toBeLessThanOrEqual(120);
      expect(safeFileBase(title)).not.toMatch(/^(con|prn|aux|nul|com\d|lpt\d)$/i);
    }
    expect(safeFileBase('../../etc/passwd')).toBe('etc-passwd');
    expect(safeFileBase('CON')).toBe('file-CON');
    expect(safeFileBase('   ')).toBe('orn-dataset');
    expect(safeFileBase('ünïcödé résumé')).toBe('unicode-resume');
  });

  it('a typed extension is not doubled, and a typed name is made safe too', () => {
    expect(fileNameOf('backup.orn.json', 'orn.json')).toBe('backup.orn.json');
    expect(fileNameOf('my backup/2026', 'ornpkg')).toBe('my-backup-2026.ornpkg');
  });
});

describe('the sentences', () => {
  it('each scope says in words what it includes', () => {
    expect(SCOPES.map((s) => s.label)).toEqual(['Everything', 'Chemistry only', 'Curriculum', 'Display settings']);
    for (const scope of SCOPES) expect(scope.text.length).toBeGreaterThan(40);
    expect(SCOPES.map((s) => s.text).join(' ')).not.toMatch(/presentation|layer|closure|subset/i);
  });

  it('images follow the format', () => {
    expect(imagesFor('embed', 'ornpkg')).toBe('package');
    expect(imagesFor('package', 'orn.json')).toBe('embed');
    expect(imagesFor('none', 'ornpkg')).toBe('none');
  });

  it('progress is in words: per image, then the final step', () => {
    expect(progressWords(2, 4, 'asset ast_x')).toBe('Adding image 2 of 3');
    expect(progressWords(4, 4, 'zip')).toBe('Packing the files into the package');
    expect(progressWords(1, 1, 'serialize')).toBe('Writing the file');
  });
});

describe('the result says what was written and every gap', () => {
  const result: ExportResult = {
    bytes: new Uint8Array(2048),
    counts: { species: 3, reaction: 2, named_reaction: 1 },
    missingAssets: [{ assetId: 'ast_one' as never, sha256: 'a'.repeat(64), reason: 'no_bytes' }],
    missingReferences: [{ from: { kind: 'topic_mapping', id: 'tmp_1' } as never, path: 'x', targetKind: 'reaction', targetId: 'rxn_gone' }],
  };
  it('counts per kind, the size, the missing image by name and the dangling reference', () => {
    const written = writtenOf(result, 'a.orn.json', false, (ref) => (ref.id === 'ast_one' ? 'benzene.png' : undefined));
    expect(written.counts).toBe('3 species, 1 named reaction, 2 reactions');
    expect(written.total).toBe(6);
    expect(written.size).toBe('2 KB');
    expect(written.missingAssets).toEqual(['Image asset benzene.png (ast_one): its picture is not stored on this device']);
    expect(written.missingReferences[0]).toContain('points at reaction rxn_gone, which is not in the file');
  });
  it('a long list is cut with a line that says how many are not listed', () => {
    const many = { ...result, missingAssets: Array.from({ length: 45 }, (_, i) => ({ assetId: `ast_${i}` as never, sha256: 'a'.repeat(64) })) };
    const written = writtenOf(many, 'a.orn.json', false, () => undefined);
    expect(written.missingAssets).toHaveLength(21);
    expect(written.missingAssets[20]).toBe('and 25 more, not listed here');
  });
  it('no records at all is said', () => {
    expect(countsWords({})).toBe('no records');
  });
});

describe('refusals', () => {
  it('worker down offers the page path in words, with no internal name', () => {
    const r = exportRefusal({ ok: false, code: 'WORKER_DOWN', message: 'no compute worker', inProcessAvailable: true });
    expect(r.text).toContain('built on this page instead');
    expect(r.text).toContain('Nothing was exported.');
    expect(exportRefusal({ ok: false, code: 'SERIALIZE_FAILED', message: 'schema_invalid at datasetId' }).text).not.toMatch(/schema_invalid|datasetId/);
  });
});

describe('the words never claim pictures that are not in the file (step 8.4s, S3)', () => {
  const everything = SCOPES.find((scope) => scope.id === 'full');
  it('Everything names the attached images only when the images are in the file', () => {
    if (everything === undefined) throw new Error('no full scope');
    expect(scopeWords(everything, 'package')).toContain('every attached image');
    expect(scopeWords(everything, 'embed')).toContain('every attached image');
    expect(scopeWords(everything, 'none')).not.toMatch(/image/);
    expect(scopeWords(everything, 'none')).toBe('All of it: the chemistry, the syllabus (exams and topics) and the display settings.');
  });
  it('the other scopes say what they say with images, and a scope without images in its words stays as it is', () => {
    const curriculum = SCOPES.find((scope) => scope.id === 'curriculum');
    if (curriculum === undefined) throw new Error('no curriculum scope');
    expect(scopeWords(curriculum, 'none')).toBe(curriculum.text);
    const chemistry = SCOPES.find((scope) => scope.id === 'chemistry');
    expect(scopeWords(chemistry ?? curriculum, 'none')).not.toMatch(/with the images attached/);
  });
  it('with No images and pictures in the dataset, a line says how many are NOT in the file', () => {
    expect(notInFileLine({ count: 3, bytes: 10 }, 'none')).toBe('3 pictures are NOT in this file.');
    expect(notInFileLine({ count: 1, bytes: 10 }, 'none')).toBe('1 picture is NOT in this file.');
    expect(notInFileLine({ count: 3, bytes: 10 }, 'package')).toBeUndefined();
    expect(notInFileLine({ count: 0, bytes: 0 }, 'none')).toBeUndefined();
  });
  it('the export opens with the package and "In the package" when the dataset has pictures with bytes', () => {
    expect(exportDefaults({ count: 2, bytes: 4096 })).toEqual({ format: 'ornpkg', images: 'package' });
    expect(exportDefaults({ count: 2, bytes: 0 })).toEqual({ format: 'orn.json', images: 'none' });
    expect(exportDefaults({ count: 0, bytes: 0 })).toEqual({ format: 'orn.json', images: 'none' });
  });
});
