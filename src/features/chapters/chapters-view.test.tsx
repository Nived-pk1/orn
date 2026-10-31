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
import { concept, contextOf } from '@/test-support/graph-state';
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

function show(state: CanonicalState, saved: Parameters<typeof createChaptersStore>[0] = {}) {
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
