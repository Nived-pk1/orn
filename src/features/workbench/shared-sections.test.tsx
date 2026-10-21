// @vitest-environment jsdom
/** The shared fields' sections (step 6.6a, decision C1): tags, notes, concepts, citations. Each reports edits as recipes; the harness applies them. */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DraftRecipe } from '@/core/editing';
import { CitationsSection, ConceptsSection, NotesSection, TagsSection } from './shared-sections';
import type { RecordChoice, RecordPickerPort } from './record-picker-contracts';

afterEach(cleanup);

const SOURCE: RecordChoice = { kind: 'reference', id: 'ref_morrison', name: 'Morrison and Boyd', kindWords: 'textbook', scope: '' };
const SOURCE2: RecordChoice = { kind: 'reference', id: 'ref_ncert', name: 'NCERT Chemistry XII', kindWords: 'ncert', scope: '' };
const CONCEPT: RecordChoice = { kind: 'concept', id: 'cpt_sn2', name: 'SN2', kindWords: 'mechanism class', scope: '' };
const all = [SOURCE, SOURCE2, CONCEPT];
const picker = (sources = 2): RecordPickerPort => ({
  describe: (kind, id) => all.find((c) => c.kind === kind && c.id === id),
  search: async (kinds, text) => all.filter((c) => kinds.includes(c.kind) && c.name.toLowerCase().includes(text.toLowerCase())),
  count: (kind) => (kind === 'reference' ? sources : 1),
  sourceOf: (id) => (id === 'ref_morrison' ? { title: 'Morrison and Boyd', year: 2010 } : id === 'ref_ncert' ? { title: 'NCERT Chemistry XII' } : undefined),
});

interface Spy {
  draft?: unknown;
}
function Harness(props: { initial: Record<string, unknown>; spy?: Spy; children: (p: { draft: unknown; onEdit: (r: DraftRecipe, path?: string) => void }) => ReactNode }) {
  const [draft, setDraft] = useState(props.initial);
  const onEdit = (recipe: DraftRecipe): void =>
    setDraft((d) => {
      const copy = structuredClone(d);
      recipe(copy);
      return copy;
    });
  if (props.spy) props.spy.draft = draft;
  return <>{props.children({ draft, onEdit })}</>;
}

describe('tags', () => {
  const show = (tags: string[] = []): Spy => {
    const spy: Spy = {};
    render(
      <Harness initial={{ tags }} spy={spy}>
        {(p) => <TagsSection {...p} />}
      </Harness>,
    );
    return spy;
  };
  const tagsOf = (spy: Spy) => (spy.draft as { tags: string[] }).tags;
  const type = (text: string, key?: string): void => {
    const input = screen.getByLabelText('Add a tag');
    fireEvent.change(input, { target: { value: text } });
    if (key) fireEvent.keyDown(input, { key });
  };
  it('adds a tag with Enter and shows it as a chip', () => {
    const spy = show();
    type('alcohols', 'Enter');
    expect(tagsOf(spy)).toEqual(['alcohols']);
    expect(screen.getByText('alcohols')).toBeTruthy();
    expect((screen.getByLabelText('Add a tag') as HTMLInputElement).value).toBe('');
  });
  it('a comma separates: each piece before it is added, the rest stays in the input', () => {
    const spy = show();
    type('a,b,c');
    expect(tagsOf(spy)).toEqual(['a', 'b']);
    expect((screen.getByLabelText('Add a tag') as HTMLInputElement).value).toBe('c');
  });
  it('removes with a button', () => {
    const spy = show(['x', 'y']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag x' }));
    expect(tagsOf(spy)).toEqual(['y']);
  });
  it('refuses the exact same tag in words; capitals alone are allowed with a note', () => {
    const spy = show(['Alcohols']);
    type('Alcohols', 'Enter');
    expect(screen.getByRole('alert').textContent).toBe('"Alcohols" is already a tag here.');
    expect(tagsOf(spy)).toEqual(['Alcohols']);
    type('alcohols', 'Enter');
    expect(tagsOf(spy)).toEqual(['Alcohols', 'alcohols']);
    expect(screen.getByRole('status').textContent).toBe('A similar tag is already here: Alcohols');
  });
  it('refuses blank text in words', () => {
    show();
    type('  ', 'Enter');
    expect(screen.getByRole('alert').textContent).toBe('A tag cannot be empty.');
  });
  it('a read-only tab cannot add', () => {
    render(<Harness initial={{ tags: ['x'] }}>{(p) => <TagsSection {...p} unavailable="This tab is read-only" />}</Harness>);
    expect((screen.getByLabelText('Add a tag') as HTMLInputElement).readOnly).toBe(true);
  });
});

describe('notes', () => {
  it('Notes and Study notes are rich text fields; an empty text removes the field', () => {
    const spy: Spy = {};
    render(
      <Harness initial={{ notes: 'old' }} spy={spy}>
        {(p) => <NotesSection {...p} fields={['studyNotes', 'notes']} />}
      </Harness>,
    );
    fireEvent.change(screen.getByLabelText('Study notes'), { target: { value: '**x**' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: '' } });
    expect(spy.draft).toEqual({ studyNotes: '**x**' });
    expect(screen.getByRole('region', { name: 'Preview of Study notes' })).toBeTruthy();
  });
});

describe('concepts', () => {
  it('lists the chosen concepts, removes one and adds one through the picker', async () => {
    const spy: Spy = {};
    render(
      <Harness initial={{ conceptIds: ['cpt_sn2'] }} spy={spy}>
        {(p) => <ConceptsSection {...p} picker={picker()} />}
      </Harness>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove SN2' }));
    expect((spy.draft as { conceptIds: string[] }).conceptIds).toEqual([]);
    fireEvent.change(screen.getByLabelText('Find a concept by name'), { target: { value: 'sn' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Add SN2' }));
    expect((spy.draft as { conceptIds: string[] }).conceptIds).toEqual(['cpt_sn2']);
  });
});

describe('citations', () => {
  const show = (citations: unknown[] = [], port: RecordPickerPort = picker(), phone = false): Spy => {
    const spy: Spy = {};
    render(
      <Harness initial={{ citations }} spy={spy}>
        {(p) => <CitationsSection {...p} picker={port} phone={phone} />}
      </Harness>,
    );
    return spy;
  };
  const cites = (spy: Spy) => (spy.draft as { citations: unknown[] }).citations;
  it('with no sources at all it says so, in words', () => {
    show([], picker(0));
    expect(screen.getByText('No sources yet. Add one with New source (Workbench).')).toBeTruthy();
  });
  it('says a source cannot be made from here', () => {
    show();
    expect(screen.getByText(/cannot be made here/)).toBeTruthy();
  });
  it('picks a source through the picker and shows the summary line', async () => {
    const spy = show();
    fireEvent.change(screen.getByLabelText('Find a source by title'), { target: { value: 'morrison' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Add Morrison and Boyd' }));
    expect(cites(spy)).toEqual([{ referenceId: 'ref_morrison' }]);
    expect(within(screen.getByRole('list', { name: 'Citations' })).getByText('Morrison and Boyd (2010)')).toBeTruthy();
  });
  it('Edit opens the locator and the note of one citation, one open at a time; the line follows the locator', () => {
    const spy = show([{ referenceId: 'ref_morrison' }, { referenceId: 'ref_ncert' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit citation Morrison and Boyd (2010)' }));
    fireEvent.change(screen.getByLabelText('Locator'), { target: { value: 'ch. 4' } });
    fireEvent.change(screen.getByLabelText('Citation note'), { target: { value: 'see table' } });
    expect(cites(spy)[0]).toEqual({ referenceId: 'ref_morrison', locator: 'ch. 4', note: 'see table' });
    expect(screen.getByText('Morrison and Boyd (2010) · ch. 4')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit citation NCERT Chemistry XII' }));
    expect(screen.getAllByLabelText('Locator')).toHaveLength(1);
  });
  it('K1: the locator is a one-line input; the note (the schema allows line breaks) is a 3-row textarea', () => {
    show([{ referenceId: 'ref_morrison' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit citation Morrison and Boyd (2010)' }));
    expect(screen.getByLabelText('Locator').tagName).toBe('INPUT');
    const note = screen.getByLabelText('Citation note') as HTMLTextAreaElement;
    expect(note.tagName).toBe('TEXTAREA');
    expect(note.rows).toBe(3);
  });
  it('moves and removes', () => {
    const spy = show([{ referenceId: 'ref_morrison' }, { referenceId: 'ref_ncert' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Move citation NCERT Chemistry XII up' }));
    expect(cites(spy)).toEqual([{ referenceId: 'ref_ncert' }, { referenceId: 'ref_morrison' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove citation NCERT Chemistry XII' }));
    expect(cites(spy)).toEqual([{ referenceId: 'ref_morrison' }]);
  });
  it('a citation of a source that is gone says so', () => {
    show([{ referenceId: 'ref_gone' }]);
    expect(screen.getByText('ref_gone (not in this dataset)')).toBeTruthy();
  });
  it('phone: rows are marked so they stack', () => {
    show([{ referenceId: 'ref_ncert' }], picker(), true);
    expect(within(screen.getByRole('list', { name: 'Citations' })).getAllByRole('listitem')[0]?.getAttribute('data-phone')).toBe('true');
  });
});
