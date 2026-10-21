// @vitest-environment jsdom
/**
 * The exam version editor (exams step part 2, X2): the exam (filled in when chained), the label and year, the status ("Choose a status", no
 * default; CUR-005 live), the syllabus units as summary lines (one open at a time) with their topic coverage rows (CUR-002 live), and
 * "Start from another version" (copies units and coverage into a NEW version; the status stays unchosen). Removing asks.
 */
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { showKnowledge, type ShownKnowledge } from '@/test-support/knowledge-kit';
import { stubDialog } from '@/test-support/window-kit';

beforeAll(stubDialog);
afterEach(cleanup);

const SEED = { examId: 'exm_jee-main' };
const TOPIC = 'top_alcohols-phenols-ethers';
const set = (label: string | RegExp, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string | RegExp, scope: HTMLElement = document.body): void => void fireEvent.click(within(scope).getByRole('button', { name }));
const settle = async (shown: ShownKnowledge): Promise<void> => {
  await act(async () => void shown.rig.ui.fireAfter(300));
  await act(async () => void shown.rig.ui.fireAfter(500));
};
type Unit = { id: string; title: string; topicCoverage: { topicId: string; coverage: string }[] };

describe('a new exam version', () => {
  it('has no exam, year or status; the status choices are in plain words; Save is refused until given', async () => {
    const { draft, rig } = showKnowledge('exam_version', { blank: true });
    for (const field of ['examId', 'status', 'year']) expect(draft()).not.toHaveProperty(field);
    const status = screen.getByLabelText('Status') as HTMLSelectElement;
    expect(status.value).toBe('');
    expect(within(status).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a status', 'Official (checked against the published syllabus)', 'Provisional (not verified)', 'Draft (not verified)']);
    expect((screen.getByLabelText('Exam') as HTMLSelectElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('heading', { name: 'Save was refused' });
    expect(Object.keys(rig.store.getState().records.exam_version)).toHaveLength(2);
  });
  it('when chained from an exam, the exam is filled in and still no status', () => {
    const { draft } = showKnowledge('exam_version', { blank: true, seed: SEED });
    expect((screen.getByLabelText('Exam') as HTMLSelectElement).value).toBe('exm_jee-main');
    expect(draft().examId).toBe('exm_jee-main');
    expect(draft()).not.toHaveProperty('status');
  });
  it('stores the label, a whole-number year and the dates as typed; an empty year is removed', () => {
    const { draft } = showKnowledge('exam_version', { blank: true, seed: SEED });
    set('Label (required)', 'Test 2027');
    set('Year', '2027');
    set('Effective from (YYYY-MM-DD)', '2027-01-01');
    expect(draft()).toMatchObject({ label: 'Test 2027', year: 2027, effectiveFrom: '2027-01-01' });
    set('Year', '');
    expect(draft()).not.toHaveProperty('year');
  });
  it('CUR-005 is live: "official" with no syllabus citation is flagged at once', async () => {
    const shown = showKnowledge('exam_version', { blank: true, real: true, seed: SEED });
    set('Label (required)', 'Test 2027'); // the rules run once the draft passes the schema
    set('Status', 'official');
    await settle(shown);
    expect(await screen.findByText(/is marked official but cites no syllabus document/)).toBeTruthy();
    set('Status', 'provisional');
    await settle(shown);
    expect(screen.queryByText(/is marked official but cites no syllabus document/)).toBeNull();
  });
});

describe('syllabus units and coverage', () => {
  it('a unit is a summary line "<unit> · <n> topics"; only one is open at a time', () => {
    const { draft } = showKnowledge('exam_version', { blank: true, seed: SEED });
    click('Add a unit');
    set('Unit title (required)', 'Alcohols unit');
    click('Close unit Alcohols unit');
    click('Add a unit');
    set('Unit title (required)', 'Amines unit');
    const units = screen.getByRole('list', { name: 'Syllabus units' });
    const lines = within(units).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(lines[0]).toContain('Alcohols unit · 0 topics');
    expect(lines[1]).toContain('Amines unit · 0 topics');
    expect(screen.getAllByLabelText('Unit title (required)')).toHaveLength(1);
    click('Open unit Alcohols unit');
    expect(screen.getAllByLabelText('Unit title (required)')).toHaveLength(1);
    expect((screen.getByLabelText('Unit title (required)') as HTMLInputElement).value).toBe('Alcohols unit');
    expect((draft().units as Unit[]).map((u) => u.title)).toEqual(['Alcohols unit', 'Amines unit']);
    expect((draft().units as Unit[])[0]?.id).toMatch(/^unt/);
  });
  it('a coverage row has a topic ("Choose a topic") and a coverage ("Choose coverage": included, partly included, excluded); the summary counts the rows', () => {
    const { draft } = showKnowledge('exam_version', { blank: true, seed: SEED });
    click('Add a unit');
    set('Unit title (required)', 'U');
    click('Add a topic');
    const topic = screen.getByLabelText('Topic of row 1') as HTMLSelectElement;
    const level = screen.getByLabelText('Coverage of row 1') as HTMLSelectElement;
    expect(topic.value).toBe('');
    expect(within(topic).getAllByRole('option')[0]?.textContent).toBe('Choose a topic');
    expect(level.value).toBe('');
    expect(within(level).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose coverage', 'Included', 'Partly included', 'Excluded']);
    set('Topic of row 1', TOPIC);
    set('Coverage of row 1', 'partial');
    expect((draft().units as Unit[])[0]?.topicCoverage).toEqual([{ topicId: TOPIC, coverage: 'partial' }]);
    click('Close unit U');
    expect(screen.getByRole('list', { name: 'Syllabus units' }).textContent).toContain('U · 1 topic');
  });
  it('CUR-002 is live: the same topic twice in one version is flagged', async () => {
    const shown = showKnowledge('exam_version', { blank: true, real: true, seed: SEED });
    set('Label (required)', 'Test 2027');
    set('Status', 'draft');
    click('Add a unit');
    set('Unit title (required)', 'U');
    for (const n of [1, 2]) {
      click('Add a topic');
      set(`Topic of row ${n}`, TOPIC);
      set(`Coverage of row ${n}`, 'included');
    }
    await settle(shown);
    expect(await screen.findByText(/This topic is already covered at unit 1, entry 1/)).toBeTruthy();
  });
  it('removing a unit asks first and says how many rows go with it; "Keep" changes nothing', () => {
    const { draft } = showKnowledge('exam_version', { blank: true, seed: SEED });
    click('Add a unit');
    set('Unit title (required)', 'U');
    click('Add a topic');
    click('Remove unit U');
    const ask = screen.getByRole('group', { name: 'Remove unit U?' });
    expect(ask.textContent).toContain('1 coverage row');
    click('Keep', ask);
    expect(draft().units as Unit[]).toHaveLength(1);
    click('Remove unit U');
    click('Remove the unit', screen.getByRole('group', { name: 'Remove unit U?' }));
    expect(draft().units as Unit[]).toHaveLength(0);
  });
  it('removing a coverage row asks first', () => {
    const { draft } = showKnowledge('exam_version', { blank: true, seed: SEED });
    click('Add a unit');
    click('Add a topic');
    click('Remove row 1');
    click('Keep', screen.getByRole('group', { name: 'Remove row 1?' }));
    expect((draft().units as Unit[])[0]?.topicCoverage).toHaveLength(1);
    click('Remove row 1');
    click('Remove the row', screen.getByRole('group', { name: 'Remove row 1?' }));
    expect((draft().units as Unit[])[0]?.topicCoverage).toHaveLength(0);
  });
});

describe('Start from another version', () => {
  it('copies the units and coverage with NEW unit IDs; the status stays unchosen and the words say so', () => {
    const { draft } = showKnowledge('exam_version', { blank: true, seed: SEED });
    const source = screen.getByLabelText('Start from another version') as HTMLSelectElement;
    expect(within(source).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a version', 'JEE Main 2026 (provisional)']);
    set('Start from another version', 'exv_jee-main-2026');
    click('Copy its units and coverage');
    const units = draft().units as Unit[];
    expect(units).toHaveLength(11);
    expect(units.reduce((n, u) => n + u.topicCoverage.length, 0)).toBe(11);
    expect(new Set(units.map((u) => u.id)).size).toBe(11);
    expect(draft()).not.toHaveProperty('status');
    expect(screen.getByRole('status', { name: 'Copied' }).textContent).toBe('Copied 11 units and 11 coverage rows from JEE Main 2026 (provisional). The status is still not chosen: choose it for this version.');
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('');
  });
  it('is not offered on a stored version', () => {
    showKnowledge('exam_version', { target: 'exv_jee-main-2026' });
    expect(screen.queryByLabelText('Start from another version')).toBeNull();
  });
  it('a stored version opens with its 11 units as summary lines', () => {
    showKnowledge('exam_version', { target: 'exv_jee-main-2026' });
    expect(within(screen.getByRole('list', { name: 'Syllabus units' })).getAllByRole('listitem')).toHaveLength(11);
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('provisional');
  });
});
