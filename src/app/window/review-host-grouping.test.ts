/** The Review port keeps the "Group by" choice in uiState, read tolerantly (7.3a E1). Written first (seen red). */
import { describe, expect, it, vi } from 'vitest';
import { createReviewPort } from './review-host';

const base = { store: { getState: () => ({}), findings: { bySubject: () => [], subscribe: () => () => undefined }, subscribe: () => () => undefined, dispatch: () => ({ ok: true }) } as never, nowMs: undefined, open: () => undefined, editors: null };

describe('createReviewPort grouping', () => {
  it('opens with the saved choice', () => {
    expect(createReviewPort({ ...base, grouping: { stored: { groupBy: 'chapter' }, save: vi.fn() } }).grouping?.initial).toBe('chapter');
  });
  it('falls back to Import (7.3b A1) for anything unusable, and keeps Import and Kind when saved', () => {
    for (const stored of [undefined, 'chapter', { groupBy: 'weeks' }, null]) expect(createReviewPort({ ...base, grouping: { stored, save: vi.fn() } }).grouping?.initial).toBe('import');
    expect(createReviewPort({ ...base, grouping: { stored: { groupBy: 'kind' }, save: vi.fn() } }).grouping?.initial).toBe('kind');
    expect(createReviewPort({ ...base, grouping: { stored: { groupBy: 'import' }, save: vi.fn() } }).grouping?.initial).toBe('import');
  });
  it('keeps a change through the saver, as an object with the one field', () => {
    const save = vi.fn();
    createReviewPort({ ...base, grouping: { stored: undefined, save } }).grouping?.save('chapter');
    expect(save).toHaveBeenCalledWith({ groupBy: 'chapter' });
  });
  it('without a saver (the bulk dialogs) there is no grouping port', () => {
    expect(createReviewPort(base).grouping).toBeUndefined();
  });
});
