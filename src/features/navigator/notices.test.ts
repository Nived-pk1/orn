import { describe, expect, it } from 'vitest';
import { cutOf, emptinessOf, truncationNoticeOf } from './notices';
import { unanchoredItems } from './unanchored';

describe('truncationNoticeOf: a truncated view always says what was cut and how to see more (INV-22 UI part)', () => {
  it('is null for a whole drawing', () => {
    expect(truncationNoticeOf(null)).toBeNull();
    expect(cutOf(null)).toBeNull();
  });

  it('says pairs, arrows and boxes with their numbers, the reason in words, and to open a family page', () => {
    const notice = truncationNoticeOf({ reason: 'max_nodes', hiddenNodeEstimate: 5, hiddenPairs: 12, hiddenEdges: 40 });
    expect(notice?.cut).toBe('This map is not complete: 12 pairs of families, 40 arrows and about 5 boxes are not drawn, because the drawing holds only so many boxes.');
    expect(notice?.more).toBe('Open a family page to see everything: its full list of reactions is there, nothing is left out.');
  });

  it('one kind of cut, singular and plural, and the case where only an estimate is known', () => {
    expect(truncationNoticeOf({ reason: 'max_edges', hiddenNodeEstimate: 0, hiddenPairs: 1, hiddenEdges: 0 })?.cut).toBe('This map is not complete: 1 pair of families is not drawn, because the drawing holds only so many arrows.');
    expect(truncationNoticeOf({ reason: 'time_budget', hiddenNodeEstimate: 1 })?.cut).toBe('This map is not complete: about 1 box is not drawn, because drawing it all would take too long.');
    expect(truncationNoticeOf({ reason: 'aborted', hiddenNodeEstimate: 0 })?.cut).toBe('This map is not complete: some of the graph is not drawn, because the work was stopped before it finished.');
  });

  it('every reason has words', () => {
    for (const reason of ['max_nodes', 'max_edges', 'max_depth', 'time_budget', 'aborted'] as const) {
      expect(truncationNoticeOf({ reason, hiddenNodeEstimate: 1 })?.cut).toMatch(/because [a-z]/);
    }
  });
});

describe('emptinessOf: an overview with nothing to show says what it means and what to do', () => {
  it('no reactions: the dataset is empty of them, and the File menu is where to load some', () => {
    expect(emptinessOf(0, 0)).toMatchObject({ kind: 'empty_dataset', title: 'This dataset has no reactions yet.' });
    expect(emptinessOf(0, 5)?.kind).toBe('empty_dataset');
    expect(emptinessOf(0, 5)?.body).toMatch(/File menu/);
  });
  it('reactions but no family: every reaction is under Unclassified, and what to do', () => {
    const none = emptinessOf(12, 0);
    expect(none?.kind).toBe('no_anchors');
    expect(none?.body).toMatch(/Unclassified/);
    expect(none?.body).toMatch(/Import a file/);
  });
  it('reactions and families: nothing to say', () => {
    expect(emptinessOf(12, 3)).toBeNull();
  });
});

describe('unanchoredItems: every id, none left out, by name then ID', () => {
  it('keeps every id, orders by folded name then id, and lists a nameless reaction by its id', () => {
    const names: Record<string, string | undefined> = { r3: 'beta', r1: 'Alpha', r2: 'alpha', r5: '', r4: undefined };
    const items = unanchoredItems(['r3', 'r1', 'r2', 'r4', 'r5'], (id) => names[id]);
    expect(items).toHaveLength(5);
    expect(items.map((i) => i.id)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
    expect(items.find((i) => i.id === 'r4')?.name).toBe('r4');
    expect(items.find((i) => i.id === 'r5')?.name).toBe('r5');
  });
  it('a thousand ids stay a thousand and are the same every time', () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `rxn_${String(i).padStart(4, '0')}`);
    const once = unanchoredItems(ids, (id) => (id.endsWith('7') ? undefined : `name ${id.slice(-2)}`));
    expect(once).toHaveLength(1000);
    expect(new Set(once.map((i) => i.id)).size).toBe(1000);
    expect(unanchoredItems([...ids].reverse(), (id) => (id.endsWith('7') ? undefined : `name ${id.slice(-2)}`))).toEqual(once);
  });
});
