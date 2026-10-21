/**
 * The "New ..." entry points are DATA (entry room, exams step part A): one table drives the Workbench buttons, the phone More buttons and the
 * palette commands, and it lives in a lazy chunk. Every entry opens a blank editor of its kind.
 */
import { describe, expect, it } from 'vitest';
import { hasFullForm } from '@/features/workbench/form-kinds';
import { FULL_EDITOR_KINDS, NEW_ENTRIES } from './editor-entries';

describe('NEW_ENTRIES', () => {
  it('lists each kind once, with a "New ..." title and a unique palette id', () => {
    expect(new Set(NEW_ENTRIES.map((e) => e.kind)).size).toBe(NEW_ENTRIES.length);
    expect(new Set(NEW_ENTRIES.map((e) => e.paletteId)).size).toBe(NEW_ENTRIES.length);
    for (const entry of NEW_ENTRIES) {
      expect(entry.title.startsWith('New ')).toBe(true);
      expect(entry.paletteId).toBe(entry.title.toLowerCase().replace(/ /g, '-'));
      expect(entry.keywords.length).toBeGreaterThan(0);
    }
  });

  it('keeps the words the Workbench has always shown, in this order', () => {
    expect(NEW_ENTRIES.map((e) => e.title)).toEqual(['New species', 'New class', 'New reagent', 'New reaction', 'New mechanism', 'New source', 'New concept', 'New named reaction', 'New transformation', 'New relationship', 'New caveat', 'New topic', 'New topic mapping', 'New exam relevance', 'New exam', 'New exam version', 'New map family']);
  });

  it('every entry and every full-editor kind has a full form', () => {
    for (const entry of NEW_ENTRIES) expect(hasFullForm(entry.kind)).toBe(true);
    expect([...FULL_EDITOR_KINDS].sort()).toEqual(NEW_ENTRIES.map((e) => e.kind).sort());
  });
});
