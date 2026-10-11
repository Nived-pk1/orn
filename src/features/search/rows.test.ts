import { describe, expect, it } from 'vitest';
import type { RecordRef } from '@/core/schema';
import type { SearchHit } from '@/search/contracts';
import { filterCommands } from './commands';
import { HEADER_ROW_HEIGHT, HIT_ROW_HEIGHT, LIST_HEIGHT, WINDOW_OVERSCAN, groupRows, nextHit, scrollToShow, windowOf } from './rows';
import { matchWords } from './words';

const hit = (n: number, kind = 'species', extra: Partial<SearchHit> = {}): SearchHit => ({ ref: { kind, id: `id_${n}` } as RecordRef, score: 1, title: `T${n}`, matchedField: 'name', ...extra });

describe('windowing', () => {
  const rows = groupRows(Array.from({ length: 100 }, (_, i) => hit(i)));
  it('renders a dozen rows for a hundred hits, and the spacers add up to the whole list', () => {
    const w = windowOf(rows, 0, LIST_HEIGHT);
    expect(w.end - w.start).toBeLessThan(20);
    expect(w.before + (w.end - w.start) * HIT_ROW_HEIGHT + w.after).toBeGreaterThan(0);
    expect(w.total).toBe(HEADER_ROW_HEIGHT + 100 * HIT_ROW_HEIGHT);
    expect(w.before).toBe(0);
  });
  it('a scrolled window keeps overscan on both sides and the spacers cover the rest', () => {
    const w = windowOf(rows, 2_000, LIST_HEIGHT);
    expect(w.start).toBeGreaterThan(0);
    expect(w.end).toBeLessThan(rows.length);
    const rendered = rows.slice(w.start, w.end).reduce((sum, row) => sum + (row.type === 'header' ? HEADER_ROW_HEIGHT : HIT_ROW_HEIGHT), 0);
    expect(w.before + rendered + w.after).toBe(w.total);
    expect(w.start).toBeLessThanOrEqual(Math.floor(2_000 / HIT_ROW_HEIGHT) - WINDOW_OVERSCAN + 1);
  });
  it('an empty list and a scroll past the end are safe', () => {
    expect(windowOf([], 100, 360)).toEqual({ start: 0, end: 0, before: 0, after: 0, total: 0 });
    const w = windowOf(rows, 1e9, LIST_HEIGHT);
    expect(w.end).toBe(rows.length);
    expect(w.after).toBe(0);
  });
  it('scrollToShow brings a row fully into view, with its header when it is first in its group', () => {
    expect(scrollToShow(rows, 1, 0, LIST_HEIGHT)).toBe(0);
    expect(scrollToShow(rows, 50, 0, LIST_HEIGHT)).toBeGreaterThan(0);
    const down = scrollToShow(rows, 50, 0, LIST_HEIGHT);
    expect(down + LIST_HEIGHT).toBeGreaterThanOrEqual(HEADER_ROW_HEIGHT + 50 * HIT_ROW_HEIGHT);
    expect(scrollToShow(rows, 1, 500, LIST_HEIGHT)).toBe(0);
  });
});

describe('moving between hits', () => {
  const rows = groupRows([hit(1, 'reaction'), hit(2, 'reaction'), hit(3, 'species')]);
  it('skips headers, stays at both ends, and pages', () => {
    // rows: H(reaction) 1 2 H(species) 3
    expect(nextHit(rows, -1, 1)).toBe(1);
    expect(nextHit(rows, 2, 1)).toBe(4);
    expect(nextHit(rows, 4, 1)).toBe(4);
    expect(nextHit(rows, 1, -1)).toBe(1);
    expect(nextHit(rows, 1, 1, 6)).toBe(4);
    expect(nextHit([], -1, 1)).toBe(-1);
  });
});

describe('what a hit matched, in words', () => {
  const base = hit(1, 'species', { title: 'Ethanol' });
  it('name, alias, formula, derived formula, structure, tag and notes', () => {
    expect(matchWords(base, {})).toBe('Matched the name');
    expect(matchWords({ ...base, matchedText: 'Ethanol' }, {})).toBe('Matched the name');
    expect(matchWords({ ...base, matchedField: 'alias', matchedText: 'Spirit' }, {})).toBe('Matched the alias “Spirit”');
    expect(matchWords({ ...base, matchedField: 'formula', matchedText: 'C2H6O' }, { enteredFormula: 'C2H6O' })).toBe('Matched the formula “C2H6O”');
    expect(matchWords({ ...base, matchedField: 'formula', matchedText: 'C2H6O' }, { derivedFormula: 'C2H6O' })).toBe('Matched the derived formula “C2H6O”');
    expect(matchWords({ ...base, matchedField: 'structure', matchedText: 'CCO' }, {})).toBe('Matched the structure text');
    expect(matchWords({ ...base, matchedField: 'tag', matchedText: 'solvent' }, {})).toBe('Matched the tag “solvent”');
    expect(matchWords({ ...base, matchedField: 'text' }, {})).toBe('Matched in the notes');
  });
  it('an entered formula equal to the derived one is the formula, not a derived formula', () => {
    expect(matchWords({ ...base, matchedField: 'formula', matchedText: 'C2H6O' }, { enteredFormula: 'C2H6O', derivedFormula: 'C2H6O' })).toBe('Matched the formula “C2H6O”');
  });
});

describe('filtering commands', () => {
  const commands = [
    { id: 'a', title: 'Zoom in', keywords: ['map'], run: () => undefined },
    { id: 'b', title: 'Show the List view', run: () => undefined },
  ];
  it('matches every word against the title and the keywords, folded; no text lists all', () => {
    expect(filterCommands(commands, '').map((c) => c.id)).toEqual(['a', 'b']);
    expect(filterCommands(commands, 'ZOOM').map((c) => c.id)).toEqual(['a']);
    expect(filterCommands(commands, 'map in').map((c) => c.id)).toEqual(['a']);
    expect(filterCommands(commands, 'list view').map((c) => c.id)).toEqual(['b']);
    expect(filterCommands(commands, 'nothing')).toEqual([]);
  });
});
