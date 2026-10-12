import { describe, expect, it } from 'vitest';
import { IMPORT_LIMITS } from '@/io';
import { appliedWords, cancellableStage, plainText, refusalWords, shownName, stageWords } from './words';

const refuse = (code: string, message = 'm', detail?: Record<string, unknown>) => refusalWords({ ok: false, code, message, ...(detail === undefined ? {} : { detail }) });

describe('refusals before the preview are said in words', () => {
  it('too large: the limits and the file size', () => {
    const r = refuse('FILE_TOO_LARGE', 'x', { size: 80 * 1024 * 1024, cap: IMPORT_LIMITS.maxJsonBytes });
    expect(r.title).toBe('The file is too large');
    expect(r.text).toContain('50 MB for a dataset file and 200 MB for a package');
    expect(r.text).toContain('The file is 80 MB; the limit is 50 MB.');
    expect(r.text).toContain('Nothing was imported.');
  });

  it('not JSON or a package, too deep, unknown format, and a newer schema', () => {
    expect(refuse('INVALID_JSON').text).toMatch(/not valid JSON and not an ORN package/);
    expect(refuse('TOO_DEEP').text).toMatch(/more than 64 levels deep/);
    expect(refuse('UNKNOWN_FORMAT').text).toMatch(/not an ORN dataset, an ORN package, or an export of the older app/);
    const newer = refuse('NEWER_SCHEMA', 'schema 9');
    expect(newer.title).toBe('Saved by a newer version of the app');
    expect(newer.text).toMatch(/saved by a newer version of the app/);
  });

  it('too many records and a long text say their limits', () => {
    expect(refuse('TOO_MANY_RECORDS').text).toContain('200,000');
    expect(refuse('STRING_TOO_LONG').text).toContain('1,000,000');
  });

  it('a lost preview and a stale one say what to do', () => {
    expect(refuse('UNKNOWN_BATCH').text).toMatch(/Preview the file again/);
    expect(refuse('STALE_REVISION').text).toMatch(/Your data changed since the preview/);
  });

  it('a failed snapshot says nothing was imported; quota says it is about space', () => {
    expect(refuse('SNAPSHOT_FAILED', 'disk error').text).toMatch(/nothing was imported/);
    const quota = refuse('SNAPSHOT_FAILED', 'QuotaExceededError');
    expect(quota.title).toBe('There is no space for the safety copy');
    expect(refuse('REJECTED', 'quota exceeded').text).toMatch(/no room left/);
  });

  it('an unknown code still says what the flow said and that nothing was imported', () => {
    expect(refuse('SOMETHING_NEW', 'odd').text).toBe('odd Nothing was imported. [SOMETHING_NEW]');
  });
});

describe('stages and results', () => {
  it('stages are words; only the steps before the commit can be cancelled', () => {
    expect(stageWords('snapshot')).toMatch(/snapshot so the import can be undone/);
    expect(stageWords('committing')).toBe('Applying the records');
    expect(stageWords('saving')).toBe('Saving to this browser');
    expect(['preparing', 'snapshot', 'committing', 'saving'].map(cancellableStage)).toEqual([true, true, false, false]);
  });

  it('"Imported N records" only when saved; otherwise what is true instead', () => {
    const base = { written: 12, skipped: 0, fileName: 'a.orn.json', saved: true, sessionOnly: false } as const;
    expect(appliedWords(base)).toEqual({ kind: 'info', text: 'Imported 12 records from a.orn.json.' });
    expect(appliedWords({ ...base, saved: false }).text).toMatch(/^Applied 12 records from a\.orn\.json, but not saved yet/);
    expect(appliedWords({ ...base, saved: false, sessionOnly: true }).text).toMatch(/^Applied 12 records from a\.orn\.json, not saved: nothing is stored in this tab/);
    expect(appliedWords({ ...base, skipped: 3 }).text).toContain('3 records were skipped (identical or kept as yours).');
  });
});

describe('text from a file is plain text', () => {
  it('control and direction characters are made visible; long names are cut', () => {
    expect(shownName('a‮b\u0000c.json')).toBe('a\\u202eb\\u0000c.json');
    expect(shownName('x'.repeat(300)).length).toBe(121);
    expect(plainText('<img src=x onerror=alert(1)>', 50)).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('no internal name is shown to a user (5.9a review, follow-up a)', () => {
  const internal = /replace_all|\bmerge\b|dataset meta|pre_import|snapshot|batch|datasetId/i;
  it('an engine message that names an internal is left out of every refusal; the sentence still stands', () => {
    for (const code of ['INVALID_META', 'BLOCKED', 'SNAPSHOT_FAILED', 'REJECTED', 'INVALID_REQUEST', 'READ_ONLY', 'BUSY', 'WORKER_DOWN', 'SOMETHING_NEW']) {
      for (const message of ["replace_all needs the file's dataset meta, and it is unusable (datasetId is empty)", 'the pre_import snapshot could not be written', 'unknown batch b1']) {
        const r = refuse(code, message);
        expect(`${r.title} ${r.text}`).not.toMatch(internal);
        expect(r.text.length).toBeGreaterThan(10);
      }
    }
  });

  it('a plain message about the file is kept in brackets', () => {
    expect(refuse('INVALID_JSON', 'Unexpected token } at position 4').text).toContain('(Unexpected token } at position 4)');
  });
});
