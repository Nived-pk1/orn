import { describe, expect, it } from 'vitest';
import { LIST_KEYS, LIST_KEY_WORDS, listShortcuts } from './list-keys';

describe('the list keys (step 8.4g Part B, G5): one table for the handler and the shortcuts sheet', () => {
  it('maps the keys the table uses to actions', () => {
    expect(LIST_KEYS.ArrowDown).toBe('next');
    expect(LIST_KEYS.PageUp).toBe('pageUp');
    expect(LIST_KEYS[' ']).toBe('open');
  });
  it('every action has words, and the sheet lists each action with its keys', () => {
    const actions = new Set(Object.values(LIST_KEYS));
    expect([...actions].sort()).toEqual(Object.keys(LIST_KEY_WORDS).sort());
    const list = listShortcuts();
    expect(list.map((e) => e.label)).toContain('Move to the next row');
    expect(list.find((e) => e.label === 'Open the row')?.keys).toEqual(['Space']);
  });
});
