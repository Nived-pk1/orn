// @vitest-environment jsdom
/**
 * The Syllabus view (7.6 D), written first (a missing component is red): the version select and its default, the status in words, the totals
 * line, units with their official wording closed, the topic rows (partial chip and note, counts in words, gap rows in Study and Studio), the
 * excluded line, "Gaps only" (Studio), the comparison with another version of the same exam, the chapter links, paging, and a saved choice
 * that names nothing.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { AnyRecord, CanonicalState, CoverageLevel, Exam, ExamVersion, RecordRef } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { examId, examVersionId, topic, topicId, topicMapping } from '@/test-support/curriculum-kit';
import { concept, ident, meta } from '@/test-support/demo/kit';
import { emptyRecordTables } from '@/core/schema';
import { createActiveExamStore, createSyllabusStore } from '@/ui/state';
import type { SyllabusPorts } from './contracts';
import { SyllabusView } from './syllabus-view';

afterEach(cleanup);

function stateOf(...records: readonly AnyRecord[]): CanonicalState {
  const tables = emptyRecordTables() as unknown as Record<string, Record<string, AnyRecord>>;
  for (const record of records) (tables[record.kind] as Record<string, AnyRecord>)[record.id] = record;
  return { meta: demoState().meta, records: tables as unknown as CanonicalState['records'] };
}

const exam = (body: string, name: string): Exam => ({ id: examId(body), kind: 'exam', name, ...meta() });
interface UnitSpec {
  readonly code?: string;
  readonly title: string;
  readonly officialText?: string;
  readonly coverage: readonly { readonly topic: string; readonly coverage: CoverageLevel; readonly note?: string }[];
}
function version(body: string, examBody: string, units: readonly UnitSpec[], o: { status?: ExamVersion['status']; year?: number; from?: string; to?: string } = {}): ExamVersion {
  return {
    id: examVersionId(body),
    kind: 'exam_version',
    examId: examId(examBody),
    label: body,
    status: o.status ?? 'provisional',
    ...(o.year === undefined ? {} : { year: o.year }),
    ...(o.from === undefined ? {} : { effectiveFrom: o.from }),
    ...(o.to === undefined ? {} : { effectiveTo: o.to }),
    units: units.map((unit, i) => ({
      id: ident<ExamVersion['units'][number]['id']>('unt', `${body}-u${i + 1}`),
      ...(unit.code === undefined ? {} : { code: unit.code }),
      title: unit.title,
      ...(unit.officialText === undefined ? {} : { officialText: unit.officialText }),
      topicCoverage: unit.coverage.map((c) => ({ topicId: topicId(c.topic), coverage: c.coverage, ...(c.note === undefined ? {} : { note: c.note }) })),
    })),
    ...meta(),
  };
}
const cpt = (body: string): RecordRef => ({ kind: 'concept', id: `cpt_${body}` }) as RecordRef;
const text = (body: string, name: string) => concept(body, name, 'general', { summary: 'Some text.' });

const base: AnyRecord[] = [
  exam('main', 'JEE Main'),
  exam('adv', 'JEE Advanced'),
  topic('subj', 'Organic', { kind: 'subject', order: 1 }),
  topic('chap-a', 'Alpha chapter', { kind: 'chapter', parent: 'subj', order: 1 }),
  topic('a-s1', 'Alpha section one', { kind: 'section', parent: 'chap-a', order: 1 }),
  topic('chap-b', 'Bravo chapter', { kind: 'chapter', parent: 'subj', order: 2 }),
  topic('chap-c', 'Charlie chapter', { kind: 'chapter', parent: 'subj', order: 3 }),
  topic('chap-d', 'Delta chapter', { kind: 'chapter', parent: 'subj', order: 4 }),
  text('c1', 'One'),
  text('c2', 'Two'),
  text('c3', 'Three'),
  topicMapping('m1', 'a-s1', cpt('c1')),
  topicMapping('m2', 'chap-a', cpt('c2')),
  topicMapping('m3', 'chap-b', cpt('c3')),
];
const v2025 = version('main-2025', 'main', [{ title: 'Old unit', coverage: [{ topic: 'chap-a', coverage: 'partial' }, { topic: 'chap-b', coverage: 'included' }] }], { year: 2025, status: 'official' });
const v2026 = version(
  'main-2026',
  'main',
  [
    { code: 'U1', title: 'First unit', officialText: 'As the board wrote it.', coverage: [{ topic: 'chap-a', coverage: 'partial', note: 'Only the basics' }, { topic: 'a-s1', coverage: 'included' }, { topic: 'chap-c', coverage: 'included' }] },
    { title: 'Second unit', coverage: [{ topic: 'chap-b', coverage: 'included' }, { topic: 'chap-d', coverage: 'excluded' }] },
  ],
  { year: 2026, from: '2026-01-01', to: '2026-12-31' },
);
const adv = version('adv-2026', 'adv', [{ title: 'Adv unit', coverage: [{ topic: 'chap-b', coverage: 'included' }] }], { year: 2026, status: 'draft' });

function show(state: CanonicalState, saved: Parameters<typeof createSyllabusStore>[0] = {}, extra: Partial<SyllabusPorts> = {}) {
  const syllabus = createSyllabusStore(saved);
  const activeExam = createActiveExamStore();
  const opened: string[] = [];
  const ports: SyllabusPorts = {
    store: { getState: () => state, subscribe: () => () => undefined },
    ui: { syllabus, exam: activeExam },
    renderRichText: (source) => <p>{source}</p>,
    openChapter: (id) => void opened.push(id),
    timers: { after: () => () => undefined },
    log: () => undefined,
    editing: false,
    ...extra,
  };
  render(<SyllabusView ports={ports} />);
  return { syllabus, exam: activeExam, opened };
}
const all = [...base, v2025, v2026, adv];

describe('the version select and its default', () => {
  it('lists every version grouped by exam; with no exam scope the default is the newest version of the first exam', () => {
    show(stateOf(...all));
    expect(screen.getByRole('heading', { level: 2, name: 'Syllabus' })).toBeTruthy();
    const select = screen.getByLabelText('Exam version') as HTMLSelectElement;
    expect(Array.from(select.querySelectorAll('optgroup')).map((g) => g.label)).toEqual(['JEE Advanced', 'JEE Main']);
    expect(Array.from(select.querySelectorAll('option')).map((o) => o.textContent)).toEqual(['adv-2026', 'main-2026', 'main-2025']);
    expect(select.value).toBe('exv_adv-2026');
  });

  it('the active exam scope decides the default, and choosing here does NOT change the scope', () => {
    const shown = show(stateOf(...all));
    act(() => shown.exam.getState().setActive({ examId: examId('main'), examVersionId: examVersionId('main-2025') } as never));
    expect((screen.getByLabelText('Exam version') as HTMLSelectElement).value).toBe('exv_main-2025');
    fireEvent.change(screen.getByLabelText('Exam version'), { target: { value: 'exv_main-2026' } });
    expect(shown.syllabus.getState().versionId).toBe('exv_main-2026');
    expect(shown.exam.getState().active?.examVersionId).toBe('exv_main-2025');
  });

  it('says the status in words, and the effective dates when there are some', () => {
    show(stateOf(...all), { versionId: 'exv_main-2026' });
    expect(screen.getByText('Provisional — not verified against the published syllabus')).toBeTruthy();
    expect(screen.getByText(/Effective 2026-01-01 to 2026-12-31/)).toBeTruthy();
    cleanup();
    show(stateOf(...all), { versionId: 'exv_main-2025' });
    expect(screen.getByText('Official')).toBeTruthy();
    cleanup();
    show(stateOf(...all), { versionId: 'exv_adv-2026' });
    expect(screen.getByText('Draft')).toBeTruthy();
  });

  it('a saved choice that names nothing falls back to the default and says so once', () => {
    show(stateOf(...all), { versionId: 'exv_gone' });
    expect((screen.getByLabelText('Exam version') as HTMLSelectElement).value).toBe('exv_adv-2026');
    expect(screen.getByRole('status').textContent).toMatch(/not in this data/);
  });

  it('no exam version at all: says so in words', () => {
    show(stateOf(...base));
    expect(screen.getByText('There is no exam version in this data yet.')).toBeTruthy();
  });
});

describe('the totals and the units', () => {
  it('the totals line counts topics, those with content and those not covered yet', () => {
    show(stateOf(...all), { versionId: 'exv_main-2026' });
    // covered: chap-a, a-s1, chap-c, chap-b = 4; content: chap-a (2 below), a-s1, chap-b = 3; chap-c is a gap
    expect(screen.getByText('4 topics in this syllabus · 3 with content · 1 not covered yet')).toBeTruthy();
  });

  it('draws the units in order: code and title as a heading, the official wording closed until opened', () => {
    show(stateOf(...all), { versionId: 'exv_main-2026' });
    const units = screen.getAllByRole('region', { name: /unit$/i });
    expect(units).toHaveLength(2);
    expect(within(units[0] as HTMLElement).getByRole('heading', { level: 3 }).textContent).toBe('U1 · First unit');
    expect(within(units[1] as HTMLElement).getByRole('heading', { level: 3 }).textContent).toBe('Second unit');
    const details = (units[0] as HTMLElement).querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByText('Official wording')).toBeTruthy();
    expect(details.textContent).toContain('As the board wrote it.');
    expect((units[1] as HTMLElement).querySelector('details')).toBeNull();
  });

  it('draws the topic rows in tree order with the partial chip and its note; included has no chip', () => {
    show(stateOf(...all), { versionId: 'exv_main-2026' });
    const unit = screen.getByRole('region', { name: /First unit/ });
    const rows = within(unit).getAllByRole('listitem').filter((li) => li.hasAttribute('data-topic-id'));
    expect(rows.map((r) => r.getAttribute('data-topic-id'))).toEqual(['top_chap-a', 'top_a-s1', 'top_chap-c']);
    expect(within(rows[0] as HTMLElement).getByText('partly').getAttribute('title')).toBe('Only the basics');
    expect(within(rows[1] as HTMLElement).queryByText('partly')).toBeNull();
    expect(rows[0]?.textContent).toContain('2 concepts');
  });

  it('a gap row: Study shows a dash instead of counts; Studio says "Nothing here yet"', () => {
    show(stateOf(...all), { versionId: 'exv_main-2026' });
    const row = document.querySelector('[data-topic-id="top_chap-c"]') as HTMLElement;
    expect(row.hasAttribute('data-gap')).toBe(true);
    expect(row.textContent).toContain('—');
    expect(row.textContent).not.toContain('Nothing here yet');
    cleanup();
    show(stateOf(...all), { versionId: 'exv_main-2026' }, { editing: true });
    expect((document.querySelector('[data-topic-id="top_chap-c"]') as HTMLElement).textContent).toContain('Nothing here yet');
  });

  it('lists the excluded topics under the unit, muted', () => {
    show(stateOf(...all), { versionId: 'exv_main-2026' });
    expect(within(screen.getByRole('region', { name: /Second unit/ })).getByText('Not in this syllabus: Delta chapter')).toBeTruthy();
  });
});

describe('Gaps only (Studio)', () => {
  it('Study has no such toggle', () => {
    show(stateOf(...all), { versionId: 'exv_main-2026' });
    expect(screen.queryByLabelText('Gaps only')).toBeNull();
  });
  it('Studio shows only the units that have gaps, and only the gap rows', () => {
    const { syllabus } = show(stateOf(...all), { versionId: 'exv_main-2026' }, { editing: true });
    fireEvent.click(screen.getByLabelText('Gaps only'));
    expect(syllabus.getState().gapsOnly).toBe(true);
    expect(screen.getAllByRole('region', { name: /unit$/i })).toHaveLength(1);
    const rows = Array.from(document.querySelectorAll('[data-topic-id]'));
    expect(rows.map((r) => r.getAttribute('data-topic-id'))).toEqual(['top_chap-c']);
  });
});

describe('the comparison', () => {
  it('is offered only when the exam has two versions or more, and lists the OTHER versions', () => {
    show(stateOf(...all), { versionId: 'exv_adv-2026' });
    expect(screen.queryByLabelText('Compare with')).toBeNull();
    cleanup();
    show(stateOf(...all), { versionId: 'exv_main-2026' });
    const select = screen.getByLabelText('Compare with') as HTMLSelectElement;
    expect(Array.from(select.querySelectorAll('option')).map((o) => o.textContent)).toEqual(['No comparison', 'main-2025']);
  });

  it('"What changed" sits above the units with its three groups, each row with the records it affects and a chapter link', () => {
    const { opened } = show(stateOf(...all), { versionId: 'exv_main-2026', compareId: 'exv_main-2025' });
    const changes = screen.getByRole('region', { name: 'What changed' });
    expect(changes.compareDocumentPosition(screen.getAllByRole('region', { name: /unit$/i })[0] as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(changes).getByRole('heading', { name: 'New in main-2026' })).toBeTruthy();
    expect(within(changes).getByRole('heading', { name: 'Not in main-2026 any more' })).toBeTruthy();
    expect(within(changes).getByRole('heading', { name: 'Changed' })).toBeTruthy();
    // new: Alpha section one, Charlie chapter; changed: none at the same level (Alpha partial both); removed: none
    expect(changes.textContent).toContain('Charlie chapter');
    expect(changes.textContent).toContain('affects 0 records');
    expect(changes.textContent).toContain('Alpha section one');
    expect(changes.textContent).toContain('affects 1 record');
    fireEvent.click(within(changes).getAllByRole('button', { name: /^Open chapter/ })[0] as HTMLElement);
    expect(opened).toEqual(['top_chap-a']);
  });

  it('a compared version at another level shows "Changed" with the two levels', () => {
    const edited = version('main-2025', 'main', [{ title: 'Old unit', coverage: [{ topic: 'chap-a', coverage: 'included' }] }], { year: 2025 });
    show(stateOf(...base, edited, v2026), { versionId: 'exv_main-2026', compareId: 'exv_main-2025' });
    const changes = screen.getByRole('region', { name: 'What changed' });
    expect(changes.textContent).toContain('included → partial');
  });

  it('an empty difference says "No change in topics"', () => {
    const same = version('main-2025', 'main', [{ title: 'Same', coverage: [{ topic: 'chap-a', coverage: 'partial' }, { topic: 'a-s1', coverage: 'included' }, { topic: 'chap-c', coverage: 'included' }, { topic: 'chap-b', coverage: 'included' }] }], { year: 2025 });
    show(stateOf(...base, same, v2026), { versionId: 'exv_main-2026', compareId: 'exv_main-2025' });
    expect(within(screen.getByRole('region', { name: 'What changed' })).getByText('No change in topics')).toBeTruthy();
  });

  it('choosing a version to compare with is saved; "No comparison" clears it', () => {
    const { syllabus } = show(stateOf(...all), { versionId: 'exv_main-2026' });
    fireEvent.change(screen.getByLabelText('Compare with'), { target: { value: 'exv_main-2025' } });
    expect(syllabus.getState().compareId).toBe('exv_main-2025');
    fireEvent.change(screen.getByLabelText('Compare with'), { target: { value: '' } });
    expect(syllabus.getState().compareId).toBeNull();
  });
});

describe('chapter links', () => {
  it('a chapter row opens its chapter; a lower topic links to the chapter it is in', () => {
    const { opened } = show(stateOf(...all), { versionId: 'exv_main-2026' });
    const chapterRow = document.querySelector('[data-topic-id="top_chap-a"]') as HTMLElement;
    fireEvent.click(within(chapterRow).getByRole('button', { name: 'Open chapter Alpha chapter' }));
    const lowerRow = document.querySelector('[data-topic-id="top_a-s1"]') as HTMLElement;
    fireEvent.click(within(lowerRow).getByRole('button', { name: 'Open chapter Alpha chapter' }));
    expect(opened).toEqual(['top_chap-a', 'top_chap-a']);
  });
});

describe('paging', () => {
  it('shows 60 rows of a unit and 60 more on request; the totals still count everything', () => {
    const many = Array.from({ length: 70 }, (_, i) => topic(`t${i}`, `Topic ${String(i).padStart(2, '0')}`, { kind: 'topic', parent: 'chap-a', order: 10 + i }));
    const v = version('big', 'main', [{ title: 'Big unit', coverage: [{ topic: 'chap-a', coverage: 'included' }, ...many.map((t) => ({ topic: t.id.slice(4), coverage: 'included' as const }))] }], { year: 2030 });
    show(stateOf(...base, ...many, v), { versionId: 'exv_big' });
    expect(document.querySelectorAll('[data-topic-id]').length).toBe(60);
    expect(screen.getByText('71 topics in this syllabus · 1 with content · 70 not covered yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show 60 more' }));
    expect(document.querySelectorAll('[data-topic-id]').length).toBe(71);
  });
});
