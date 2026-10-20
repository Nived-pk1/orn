/**
 * The shipped dataset as the window knows it (studio step E4): `demo` or `published` (with the sha256 this browser last loaded, kept in
 * `uiState`), the words that follow from it, when the update notice is due, and the remembered sha256 itself (read tolerantly at boot,
 * written when a load is applied).
 */
import { describe, expect, it, vi } from 'vitest';
import { createDatasetInfo, datasetWordsOf, STUDY_DATASET_KEY, studyUpdateDue, type DatasetInfo } from './dataset-info';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const published = (loadedSha256: string | undefined, remember: (sha: string) => void = () => undefined): DatasetInfo => ({ kind: 'published', sha256: SHA_B, publishedAt: '2026-10-21T09:30:00.000Z', loadedSha256, remember });

describe('datasetWordsOf', () => {
  it('the demo keeps today\'s words; a published dataset says "study dataset"', () => {
    expect(datasetWordsOf(undefined).load).toBe('Load demo dataset');
    expect(datasetWordsOf({ kind: 'demo' }).load).toBe('Load demo dataset');
    expect(datasetWordsOf({ kind: 'demo' }).replaceTitle).toBe('Replace with the demo dataset');
    const words = datasetWordsOf(published(undefined));
    expect(words.load).toBe('Load the study dataset');
    expect(words.replaceTitle).toBe('Replace with the study dataset');
    expect(words.replaceBody).toContain('study dataset');
    expect(words.noun).toBe('study dataset');
  });
});

describe('studyUpdateDue', () => {
  const due = (over: Partial<Parameters<typeof studyUpdateDue>[0]> = {}) => studyUpdateDue({ editing: false, dataset: published(SHA_A), hasData: true, dismissed: false, ...over });
  it('due when a published dataset exists whose sha256 differs from the one this browser last loaded', () => {
    expect(due()).toBe(true);
    expect(due({ dataset: published(undefined) })).toBe(true); // this browser never loaded one
  });
  it('not due: the same sha256, the demo, no dataset info, Later chosen, an empty dataset (the first-run screen offers it), or the Studio edition', () => {
    expect(due({ dataset: published(SHA_B) })).toBe(false);
    expect(due({ dataset: { kind: 'demo' } })).toBe(false);
    expect(due({ dataset: undefined })).toBe(false);
    expect(due({ dismissed: true })).toBe(false);
    expect(due({ hasData: false })).toBe(false);
    expect(due({ editing: true })).toBe(false);
  });
});

describe('createDatasetInfo: the remembered sha256 in uiState', () => {
  const manifest = { sha256: SHA_B, publishedAt: '2026-10-21T09:30:00.000Z' };
  it('the demo when nothing is published', () => {
    expect(createDatasetInfo({ bootReport: undefined, persistence: undefined, status: { get: () => ({ mode: 'writer' }) } } as never, null)).toEqual({ kind: 'demo' });
  });
  it('reads the last loaded sha256 at boot; a missing, wrong-shaped or wrong-looking entry is "none" (never trusted)', () => {
    const at = (entry: unknown) => createDatasetInfo({ bootReport: { uiState: entry === undefined ? {} : { [STUDY_DATASET_KEY]: entry } }, persistence: undefined, status: { get: () => ({ mode: 'writer' }) } } as never, manifest);
    expect(at({ sha256: SHA_A })).toMatchObject({ kind: 'published', sha256: SHA_B, loadedSha256: SHA_A });
    for (const bad of [undefined, null, 5, 'x', { sha256: 'short' }, { sha256: SHA_A.toUpperCase() }, { other: SHA_A }, [SHA_A]]) expect(at(bad as never)).toMatchObject({ loadedSha256: undefined });
  });
  it('remember writes {sha256} to uiState in a writer tab, and in no other mode (the tab remembers nothing it could not save)', async () => {
    const setUiState = vi.fn(async () => undefined);
    const make = (mode: string) => createDatasetInfo({ bootReport: { uiState: {} }, persistence: { setUiState }, status: { get: () => ({ mode }) } } as never, manifest);
    const info = make('writer');
    if (info.kind !== 'published') throw new Error('expected published');
    info.remember(SHA_B);
    expect(setUiState).toHaveBeenCalledWith(STUDY_DATASET_KEY, { sha256: SHA_B });
    setUiState.mockClear();
    const follower = make('follower');
    if (follower.kind === 'published') follower.remember(SHA_B);
    expect(setUiState).not.toHaveBeenCalled();
  });
  it('a failing write is swallowed (the notice then simply shows again at the next visit)', () => {
    const info = createDatasetInfo({ bootReport: { uiState: {} }, persistence: { setUiState: async () => Promise.reject(new Error('full')) }, status: { get: () => ({ mode: 'writer' }) } } as never, manifest);
    if (info.kind !== 'published') throw new Error('expected published');
    expect(() => info.remember(SHA_B)).not.toThrow();
  });
});
