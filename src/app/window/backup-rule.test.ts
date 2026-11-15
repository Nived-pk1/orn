/** How old the last backup is and when to say so (step 8.4s, S4; audit DA-04). Pure rule over the revision and the injected clock. */
import { describe, expect, it } from 'vitest';
import { agoWords, backupLineOf, backupNoticeDue, backupNoticeText, parseMark } from './backup-rule';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-14T12:00:00.000Z');
const at = (msAgo: number): string => new Date(NOW - msAgo).toISOString();

describe('the words', () => {
  it('says how long ago in the biggest whole unit', () => {
    expect(agoWords(20_000)).toBe('just now');
    expect(agoWords(5 * 60_000)).toBe('5 minutes ago');
    expect(agoWords(60_000)).toBe('1 minute ago');
    expect(agoWords(3 * 3_600_000)).toBe('3 hours ago');
    expect(agoWords(2 * DAY + 1000)).toBe('2 days ago');
    expect(agoWords(DAY)).toBe('1 day ago');
  });
  it('the status line', () => {
    expect(backupLineOf(undefined, 12, NOW)).toBe('No backup yet');
    expect(backupLineOf({ revision: 100, at: at(2 * DAY) }, 440, NOW)).toBe('Backed up 2 days ago, 340 changes since');
    expect(backupLineOf({ revision: 100, at: at(2 * DAY) }, 101, NOW)).toBe('Backed up 2 days ago, 1 change since');
    expect(backupLineOf({ revision: 100, at: at(60_000) }, 100, NOW)).toBe('Backed up 1 minute ago, no changes since');
  });
  it('the notice', () => {
    expect(backupNoticeText(340)).toBe('340 changes are not in a backup.');
    expect(backupNoticeText(1)).toBe('1 change is not in a backup.');
  });
});

describe('when the notice appears', () => {
  const last = { revision: 100, at: at(DAY) };
  it('at 200 changes since the last backup, not at 199', () => {
    expect(backupNoticeDue({ last, revision: 299, nowMs: NOW })).toBe(false);
    expect(backupNoticeDue({ last, revision: 300, nowMs: NOW })).toBe(true);
  });
  it('after 3 days with at least one change, not with none', () => {
    const old = { revision: 100, at: at(3 * DAY) };
    expect(backupNoticeDue({ last: old, revision: 101, nowMs: NOW })).toBe(true);
    expect(backupNoticeDue({ last: old, revision: 100, nowMs: NOW })).toBe(false);
    expect(backupNoticeDue({ last: { revision: 100, at: at(3 * DAY - 1000) }, revision: 101, nowMs: NOW })).toBe(false);
  });
  it('with no backup yet it waits for 200 changes (no time to count from)', () => {
    expect(backupNoticeDue({ last: undefined, revision: 199, nowMs: NOW })).toBe(false);
    expect(backupNoticeDue({ last: undefined, revision: 200, nowMs: NOW })).toBe(true);
  });
  it('Dismiss hides it until 200 more changes or 3 more days', () => {
    const dismissed = { revision: 300, at: at(DAY) };
    expect(backupNoticeDue({ last, revision: 499, nowMs: NOW, dismissed })).toBe(false);
    expect(backupNoticeDue({ last, revision: 500, nowMs: NOW, dismissed })).toBe(true);
    expect(backupNoticeDue({ last, revision: 301, nowMs: NOW, dismissed: { revision: 300, at: at(3 * DAY) } })).toBe(true);
  });
  it('a dismissal from before the last backup no longer counts', () => {
    expect(backupNoticeDue({ last: { revision: 400, at: at(DAY) }, revision: 600, nowMs: NOW, dismissed: { revision: 350, at: at(60_000) } })).toBe(true);
  });
});

describe('reading the stored mark tolerantly', () => {
  it('takes a good one and ignores anything else', () => {
    expect(parseMark({ revision: 4, at: '2026-11-14T12:00:00.000Z' })).toEqual({ revision: 4, at: '2026-11-14T12:00:00.000Z' });
    for (const bad of [undefined, null, 5, 'x', [], { revision: 'a', at: 'x' }, { revision: 1.5, at: '2026-11-14T12:00:00.000Z' }, { revision: 1, at: 'not a date' }, { revision: -1, at: '2026-11-14T12:00:00.000Z' }]) {
      expect(parseMark(bad)).toBeUndefined();
    }
  });
});
