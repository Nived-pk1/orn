// @vitest-environment jsdom
/**
 * The Chapters view (step 7.3b D1-D3, D6): the list with its counts in words and "No chapter yet" last, a chapter page with its groups in
 * the study order, the kind chips, the name box, 30 cards at a time, a click selecting the record, and a saved chapter that is gone.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyRecordTables, type AnyRecord, type CanonicalState, type RecordRef } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { examVersion, topic, topicMapping } from '@/test-support/curriculum-kit';
import { concept as bareConcept, contextOf } from '@/test-support/graph-state';
import { createActiveExamStore, createChaptersStore, createInspectorStore } from '@/ui/state';
import type { ChaptersPorts } from './contracts';
import { ChaptersView } from './chapters-view';

afterEach(cleanup);

/** jsdom cannot load the fixture `stateOf` uses, so the meta comes from the demo and the tables start empty. */
function stateOf(...records: readonly AnyRecord[]): CanonicalState {
  const tables = emptyRecordTables() as unknown as Record<string, Record<string, AnyRecord>>;
  for (const record of records) (tables[record.kind] as Record<string, AnyRecord>)[record.id] = record;
  return { meta: demoState().meta, records: tables as unknown as CanonicalState['records'] };
}

/** A concept with text; the empty ones are set apart (7.3c A3). */
const concept = (body: string, name: string, kind: Parameters<typeof bareConcept>[2]) => bareConcept(body, name, kind, { summary: 'Some text.' });
const cpt = (body: string): RecordRef => ({ kind: 'concept', id: `cpt_${body}` }) as RecordRef;
const manyConcepts = (n: number): AnyRecord[] => Array.from({ length: n }, (_, i) => [concept(`m${i}`, `Many ${String(i).padStart(2, '0')}`, 'general'), topicMapping(`mm${i}`, 'chap-a', cpt(`m${i}`))]).flat();

const base: AnyRecord[] = [
  topic('subj', 'Organic', { kind: 'subject', order: 1 }),
  topic('chap-a', 'Alpha chapter', { kind: 'chapter', parent: 'subj', order: 1 }),
  topic('chap-b', 'Bravo chapter', { kind: 'chapter', parent: 'subj', order: 2 }),
  concept('c1', 'Inductive effect', 'general'),
  concept('c2', 'Resonance', 'general'),
  concept('loose', 'Unmapped idea', 'general'),
  topicMapping('m1', 'chap-a', cpt('c1')),
  topicMapping('m2', 'chap-a', cpt('c2'), 'supporting'),
  topicMapping('m3', 'chap-b', cpt('c2')),
];

function show(state: CanonicalState, saved: Parameters<typeof createChaptersStore>[0] = {}, editing = true) {
  const context = contextOf(state);
  const chapters = createChaptersStore(saved);
  const exam = createActiveExamStore();
  const inspector = createInspectorStore();
  const selected: string[] = [];
  const ports: ChaptersPorts = {
    store: { getState: () => state, subscribe: () => () => undefined },
    indexes: { current: () => context.indexes },
    ui: { chapters, exam, inspector },
    nameOf: (ref) => {
      const one = (state.records[ref.kind] as Record<string, { name?: string; names?: { canonical: string } }>)[ref.id];
      return one?.name ?? one?.names?.canonical ?? ref.id;
    },
    select: (ref) => (selected.push(ref.id), inspector.getState().open(ref)),
    selectReaction: (id) => void selected.push(id),
    renderCard: (args) => <div data-card={args.reactionId} />,
    renderRichText: (source) => <p>{source}</p>,
    renderPictures: () => null,
    renderSubstance: (ref) => <span>{ref.id}</span>,
    renderRoute: (id) => <span>{id}</span>,
    timers: { after: () => () => undefined },
    log: () => undefined,
    editing,
  };
  render(<ChaptersView ports={ports} />);
  return { chapters, exam, selected, ports };
}

describe('the list', () => {
  it('lists chapters in tree order with their counts in words, and "No chapter yet" last', () => {
    show(stateOf(...base));
    const rows = within(screen.getByRole('list', { name: 'Chapters' })).getAllByRole('listitem').filter((li) => li.hasAttribute('data-chapter-id'));
    expect(rows.map((r) => r.querySelector('button')?.textContent)).toEqual(['Alpha chapter', 'Bravo chapter', 'No chapter yet']);
    expect(rows[0]?.textContent).toContain('2 concepts');
    expect(rows[1]?.textContent).toContain('1 concept');
    expect(rows[2]?.textContent).toContain('1 concept');
  });

  it('opening a chapter shows its page, "All chapters" goes back', () => {
    const { chapters } = show(stateOf(...base));
    fireEvent.click(screen.getByRole('button', { name: 'Alpha chapter' }));
    expect(chapters.getState().chapterId).toBe('top_chap-a');
    expect(screen.getByRole('heading', { level: 2, name: 'Alpha chapter' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'All chapters' }));
    expect(chapters.getState().chapterId).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Chapters' })).toBeTruthy();
  });

  it('a saved chapter that is gone is dropped and said once', () => {
    show(stateOf(...base), { chapterId: 'top_gone' });
    expect(screen.getByRole('status').textContent).toContain('no longer in the data');
    expect(screen.getByRole('heading', { level: 2, name: 'Chapters' })).toBeTruthy();
  });

  it('an exam scope lists only the chapters that version covers and says how many are hidden', () => {
    const state = stateOf(...base, examVersion('v1', 'jee', [{ topic: 'chap-b', coverage: 'included' }]));
    const { exam } = show(state);
    act(() => exam.getState().setActive({ examId: 'exm_jee', examVersionId: 'exv_v1' } as never));
    const names = within(screen.getByRole('list', { name: 'Chapters' })).getAllByRole('button').map((b) => b.textContent);
    expect(names).toEqual(['Bravo chapter', 'No chapter yet']);
    expect(screen.getByText(/1 chapter is hidden/)).toBeTruthy();
  });
});

describe('"No chapter yet" under an exam scope (7.3c A2)', () => {
  const state = stateOf(...base, examVersion('v1', 'jee', [{ topic: 'chap-b', coverage: 'included' }]));
  const names = (): (string | null)[] => within(screen.getByRole('list', { name: 'Chapters' })).getAllByRole('button').map((b) => b.textContent);
  it('Study: listed without a scope, left out with one', () => {
    const { exam } = show(state, {}, false);
    expect(names()).toEqual(['Alpha chapter', 'Bravo chapter', 'No chapter yet']);
    act(() => exam.getState().setActive({ examId: 'exm_jee', examVersionId: 'exv_v1' } as never));
    expect(names()).toEqual(['Bravo chapter']);
  });
  it('Studio: listed with a scope too', () => {
    const { exam } = show(state, {}, true);
    act(() => exam.getState().setActive({ examId: 'exm_jee', examVersionId: 'exv_v1' } as never));
    expect(names()).toEqual(['Bravo chapter', 'No chapter yet']);
  });
});

describe('concepts with no text (7.3c A3)', () => {
  const empties = [...base, bareConcept('e1', 'Empty one', 'general'), bareConcept('e2', 'Empty two', 'general'), topicMapping('me1', 'chap-a', cpt('e1')), topicMapping('me2', 'chap-a', cpt('e2'))];
  it('Study: not a card, not counted, no line', () => {
    show(stateOf(...empties), { chapterId: 'top_chap-a' }, false);
    expect(screen.queryByRole('article', { name: 'Empty one' })).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'Concepts (2)' })).toBeTruthy();
    expect(screen.queryByText(/Not written yet/)).toBeNull();
  });
  it('Studio: one quiet line at the end of the Concepts group with links, counted apart in the list', () => {
    show(stateOf(...empties), { chapterId: 'top_chap-a' }, true);
    expect(screen.queryByRole('article', { name: 'Empty one' })).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'Concepts (2)' })).toBeTruthy();
    const line = document.querySelector('[data-unwritten]') as HTMLElement;
    expect(line.textContent).toBe('Not written yet: Empty one, Empty two');
    fireEvent.click(within(line).getByRole('button', { name: 'Empty two' }));
    expect(screen.getAllByRole('article').length).toBe(2);
  });
  it('the list says "+ 2 not written" in Studio only', () => {
    show(stateOf(...empties), {}, true);
    expect(screen.getByText(/2 concepts \+ 2 not written/)).toBeTruthy();
    cleanup();
    show(stateOf(...empties), {}, false);
    expect(screen.queryByText(/not written/)).toBeNull();
  });
});

describe('a chapter page', () => {
  it('has group headings with counts, "Also used here" under the core records, and a click selects the record', () => {
    const { selected } = show(stateOf(...base), { chapterId: 'top_chap-a' });
    expect(screen.getByRole('heading', { level: 3, name: 'Concepts (2)' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 4, name: 'Also used here' })).toBeTruthy();
    fireEvent.click(screen.getByRole('article', { name: 'Inductive effect' }));
    expect(selected).toEqual(['cpt_c1']);
  });

  it('the kind chip narrows the page and the name box finds a record; both are saved state', () => {
    const { chapters } = show(stateOf(...base), { chapterId: 'top_chap-a' });
    fireEvent.change(screen.getByLabelText('Find in this chapter'), { target: { value: 'reson' } });
    expect(chapters.getState().text).toBe('reson');
    expect(screen.queryByRole('article', { name: 'Inductive effect' })).toBeNull();
    expect(screen.getByRole('article', { name: 'Resonance' })).toBeTruthy();
    expect(screen.getByText(/1 record is left out/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Concepts 2' }));
    expect(chapters.getState().kinds).toEqual(['concepts']);
  });

  it('shows 30 cards at a time and says so', () => {
    show(stateOf(...base, ...manyConcepts(35)), { chapterId: 'top_chap-a' });
    expect(screen.getAllByRole('article')).toHaveLength(30);
    expect(screen.getByText(/Showing 30 of 37 concepts/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show 30 more' }));
    expect(screen.getAllByRole('article')).toHaveLength(37);
  });

  it('"No chapter yet" lists the records mapped nowhere', () => {
    show(stateOf(...base), { chapterId: 'none' });
    expect(screen.getByRole('heading', { level: 2, name: 'No chapter yet' })).toBeTruthy();
    expect(screen.getByRole('article', { name: 'Unmapped idea' })).toBeTruthy();
  });
});
