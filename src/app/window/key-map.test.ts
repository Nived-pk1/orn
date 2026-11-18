import { describe, expect, it } from 'vitest';
import { BINDINGS, bindingFor } from './key-map';
import { LATE_BINDINGS, lateBindingFor } from './key-map-late';
import { BINDING_WORDS, shortcutGroups } from './key-words';

const key = (k: string, over: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...over });

describe('the window key map (step 8.4g Part B, G2 and G5)', () => {
  it('each binding matches its own keys and nothing with a different modifier', () => {
    expect(bindingFor('palette').match(key('k', { ctrlKey: true }))).toBe(true);
    expect(bindingFor('palette').match(key('K', { metaKey: true }))).toBe(true);
    expect(bindingFor('palette').match(key('k'))).toBe(false);
    expect(bindingFor('palette').match(key('k', { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(lateBindingFor('star').match(key('s'))).toBe(true);
    expect(lateBindingFor('star').match(key('S', { shiftKey: true }))).toBe(true);
    expect(lateBindingFor('star').match(key('s', { ctrlKey: true }))).toBe(false);
    expect(lateBindingFor('shortcuts').match(key('?', { shiftKey: true }))).toBe(true);
    expect(lateBindingFor('shortcuts').match(key('?', { ctrlKey: true }))).toBe(false);
    expect(bindingFor('undo').match(key('z', { ctrlKey: true }))).toBe(true);
    expect(bindingFor('undo').match(key('z', { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(bindingFor('redo').match(key('z', { metaKey: true, shiftKey: true }))).toBe(true);
    expect(bindingFor('redo').match(key('y', { ctrlKey: true }))).toBe(true);
  });

  it('every binding has words, keys and a group (kept apart from the table, so the entry does not carry them)', () => {
    for (const binding of [...BINDINGS, ...LATE_BINDINGS]) {
      const words = BINDING_WORDS[binding.id];
      expect(words.label.length).toBeGreaterThan(3);
      expect(words.keys.length).toBeGreaterThan(0);
      expect(['Anywhere', 'Studio']).toContain(words.group);
    }
    expect(Object.keys(BINDING_WORDS).sort()).toEqual([...BINDINGS, ...LATE_BINDINGS].map((b) => b.id).sort());
  });

  it('the sheet groups: Anywhere, Map, Lists, then Studio only for an author edition', () => {
    const study = shortcutGroups(false);
    expect(study.map((g) => g.title)).toEqual(['Anywhere', 'Map', 'Lists']);
    expect(study[0]?.entries.map((e) => e.label)).toContain('Search records and commands');
    expect(study[1]?.entries.map((e) => e.label)).toContain('Zoom in'); // read from the map's own key function
    expect(study[2]?.entries.map((e) => e.label)).toContain('Move to the next row'); // read from the list's own table
    const studio = shortcutGroups(true);
    expect(studio.map((g) => g.title)).toEqual(['Anywhere', 'Map', 'Lists', 'Studio']);
    expect(studio[3]?.entries.map((e) => e.label)).toEqual(expect.arrayContaining(['Undo the last change', 'Redo the change']));
    expect(studio[1]?.entries.map((e) => e.label).join('|')).toContain('Studio');
  });
});
