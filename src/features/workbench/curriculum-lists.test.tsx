// @vitest-environment jsdom
/**
 * The read-only curriculum lists every record editor shows (step 6.6c part 2, M2): "Syllabus topics" with "Map to a topic", and
 * "New relationship from here" on the Relationships list. Each keeps the draft, closes the editor and asks for a NEW editor with this
 * record filled in. A record not saved yet cannot be mapped (the mapping would point at nothing).
 */
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { showKnowledge } from '@/test-support/knowledge-kit';
import { stubDialog } from '@/test-support/window-kit';

beforeAll(stubDialog);
afterEach(cleanup);

const open = (name: RegExp): void => {
  const toggle = screen.getAllByRole('button', { name })[0] as HTMLElement;
  if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
};
const REACTION = 'rxn_alcohol1-to-aldehyde-pcc';

describe('Syllabus topics', () => {
  it('lists "<topic> · <role>" with a way to open the topic in the inspector', () => {
    const shown = showKnowledge('reaction', { target: REACTION });
    open(/Syllabus topics/);
    const list = screen.getByRole('list', { name: 'Syllabus topics' });
    expect(within(list).getByText('Oxidation and dehydration of alcohols · core')).toBeTruthy();
    fireEvent.click(within(list).getByRole('button', { name: 'Open Oxidation and dehydration of alcohols in the inspector' }));
    expect(shown.openRecord).toHaveBeenCalledWith({ kind: 'topic', id: 'top_alcohol-oxidation-dehydration' });
  });
  it('"Map to a topic" keeps the draft and asks for a NEW mapping with the target filled in', () => {
    const shown = showKnowledge('reaction', { target: REACTION });
    open(/Syllabus topics/);
    fireEvent.click(screen.getByRole('button', { name: 'Map to a topic' }));
    expect(shown.start).toHaveBeenCalledWith('topic_mapping', { target: { kind: 'reaction', id: REACTION } });
  });
  it('says "Not mapped to a topic." for a record with none, and on a record not saved yet the button says to save it first', () => {
    showKnowledge('species', { blank: true });
    open(/Syllabus topics/);
    expect(screen.getByText('Not mapped to a topic.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Map to a topic', description: /save the record first/i }).getAttribute('aria-disabled')).toBe('true');
  });
  it('is on every kind that can be a target, and not on the curriculum records themselves', () => {
    for (const kind of ['species', 'class', 'reagent', 'reaction', 'mechanism', 'concept', 'named_reaction', 'transformation', 'caveat', 'reference', 'relationship'] as const) {
      showKnowledge(kind, { blank: true });
      expect(screen.getByRole('region', { name: 'Syllabus topics' })).toBeTruthy();
      cleanup();
    }
    for (const kind of ['topic', 'topic_mapping'] as const) {
      showKnowledge(kind, { blank: true });
      expect(screen.queryByRole('region', { name: 'Syllabus topics' })).toBeNull();
      cleanup();
    }
  });
});

describe('Relationships', () => {
  it('"New relationship from here" keeps the draft and asks for a NEW relationship with this record as the first end', () => {
    const shown = showKnowledge('reaction', { target: REACTION });
    open(/^▸ Relationships|Relationships/);
    fireEvent.click(screen.getByRole('button', { name: 'New relationship from here' }));
    expect(shown.start).toHaveBeenCalledWith('relationship', { from: { kind: 'reaction', id: REACTION } });
  });
  it('on a record not saved yet the button says to save it first', () => {
    showKnowledge('reaction', { blank: true });
    open(/Relationships/);
    expect(screen.getByRole('button', { name: 'New relationship from here', description: /save the record first/i }).getAttribute('aria-disabled')).toBe('true');
  });
});
