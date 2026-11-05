/** The ONE edition rule for what a student sees (step 8.3, ADR-045): which author and developer pieces each edition and visitor shows. Pure. */
import { describe, expect, it } from 'vitest';
import { STUDIO_CHROME, studyChrome } from './study-chrome';

describe('studyChrome', () => {
  it('Studio shows every piece: the full status bar, the storage warning, the layout note, the import notice, Dataset, Unanchored, the full selection line, the pill and every word', () => {
    expect(studyChrome('studio', { ownData: false })).toEqual(STUDIO_CHROME);
    expect(studyChrome('studio', { ownData: true })).toEqual(STUDIO_CHROME);
    expect(STUDIO_CHROME).toEqual({
      statusBar: 'full',
      storageWarning: 'author',
      layoutNotice: true,
      publishedImportNotice: true,
      datasetRail: true,
      datasetCounts: true,
      unanchored: true,
      selectionLine: 'full',
      reviewMark: 'pill',
      exclusiveWord: true,
      examStatusWords: true,
    });
  });
  it('Study without own data shows no status bar, no storage warning, no layout note, no published-import notice, no Dataset, no Unanchored; a name-only selection line, the quiet dot, no "exclusive"', () => {
    expect(studyChrome('study', { ownData: false })).toEqual({
      statusBar: 'none',
      storageWarning: 'none',
      layoutNotice: false,
      publishedImportNotice: false,
      datasetRail: false,
      datasetCounts: false,
      unanchored: false,
      selectionLine: 'name',
      reviewMark: 'dot',
      exclusiveWord: false,
      examStatusWords: false,
    });
  });
  it('Study with own data adds only the quiet saved line and the visitor storage warning (the other pieces stay hidden)', () => {
    const own = studyChrome('study', { ownData: true });
    expect(own.statusBar).toBe('saved-line');
    expect(own.storageWarning).toBe('visitor');
    expect(own).toEqual({ ...studyChrome('study', { ownData: false }), statusBar: 'saved-line', storageWarning: 'visitor' });
  });
  it('is a pure function of its two inputs', () => {
    expect(studyChrome('study', { ownData: true })).toEqual(studyChrome('study', { ownData: true }));
  });
});
