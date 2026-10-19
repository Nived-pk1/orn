/** The words of the draft state (ADR-040, part 3d). */
import { describe, expect, it } from 'vitest';
import { utcTime } from '@/test-support/editing-kit';
import { draftStatusText, draftsLabel, editingUnavailableReason } from './draft-text';

describe('draftStatusText', () => {
  it('says Saving draft..., Draft saved <time> and Draft not saved: <reason>', () => {
    expect(draftStatusText({ state: 'saving' }, 'stored', utcTime)).toBe('Saving draft...');
    expect(draftStatusText({ state: 'saved', at: '2026-10-17T12:34:56.000Z' }, 'stored', utcTime)).toBe('Draft saved 2026-10-17 12:34 UTC');
    expect(draftStatusText({ state: 'failed', reason: 'quota' }, 'stored', utcTime)).toBe('Draft not saved: quota');
    expect(draftStatusText({ state: 'idle' }, 'stored', utcTime)).toBe('No changes yet');
  });

  it('a window that keeps no drafts says so, whatever the state', () => {
    expect(draftStatusText({ state: 'memory' }, 'memory', utcTime)).toBe('Drafts are not kept in this window');
    expect(draftStatusText({ state: 'saving' }, 'memory', utcTime)).toBe('Drafts are not kept in this window');
  });

  it('editing is unavailable in a read-only tab with the reason; available otherwise', () => {
    expect(editingUnavailableReason('read_only')).toBe('This tab is read-only: edit in the tab that is saving');
    expect(editingUnavailableReason('stored')).toBeUndefined();
    expect(editingUnavailableReason('memory')).toBeUndefined();
  });

  it('the menu label is plain text', () => {
    expect(draftsLabel(null)).toBe('Drafts (0)');
    expect(draftsLabel(4)).toBe('Drafts (4)');
  });
});
