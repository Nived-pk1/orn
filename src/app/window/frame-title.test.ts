import { describe, expect, it } from 'vitest';
import { crumbOf, documentTitleOf } from './frame-title';

describe('the tab title (step 8.4d, C5)', () => {
  it('is "<record> · <view> · ORN" when a record is shown, "<view> · ORN" otherwise', () => {
    expect(documentTitleOf({ section: 'Map', record: 'Alcohols' })).toBe('Alcohols · Map · ORN');
    expect(documentTitleOf({ section: 'Reactions' })).toBe('Reactions · ORN');
  });
  it('an empty record name counts as no record', () => {
    expect(documentTitleOf({ section: 'Map', record: '' })).toBe('Map · ORN');
  });
});

describe('the breadcrumb: the view, then the record the page is about', () => {
  const modes = [{ id: 'navigator', label: 'Map' }, { id: 'reactions', label: 'Reactions' }];
  it('names the active view by its rail label', () => {
    expect(crumbOf(modes, 'reactions', undefined)).toEqual({ section: 'Reactions' });
  });
  it('adds the record name when there is one', () => {
    expect(crumbOf(modes, 'navigator', 'Alcohols')).toEqual({ section: 'Map', record: 'Alcohols' });
  });
  it('falls back to the mode id for a view the rail does not list (never an empty crumb)', () => {
    expect(crumbOf(modes, 'dataset', undefined)).toEqual({ section: 'dataset' });
  });
});
