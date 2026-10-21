// @vitest-environment jsdom
/**
 * The exam relevance editor (step 6.6c part 3, M3): the record ("Find the target record by name"), the exam ("Choose an exam"), the
 * versions of THAT exam (none chosen = every version, said in words), the scope ("Choose a scope", four plain words), the importance ("Not set" or 1 to 5),
 * a note; CUR-003 and CUR-004 come live from the real rules; a version of another exam is never hidden.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { showKnowledge, type ShownKnowledge } from '@/test-support/knowledge-kit';
import { stubDialog } from '@/test-support/window-kit';

beforeAll(stubDialog);
afterEach(cleanup);

const set = (label: string | RegExp, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const settle = async (shown: ShownKnowledge): Promise<void> => {
  await act(async () => void shown.rig.ui.fireAfter(300));
  await act(async () => void shown.rig.ui.fireAfter(500));
};
const pickTarget = async (text: string, name: string): Promise<void> => {
  set('Find the target record by name', text);
  fireEvent.click(within(await screen.findByRole('list', { name: 'Records found' })).getByRole('button', { name: `Add ${name}` }));
};
const BECKMANN = 'Beckmann';

describe('a new exam relevance', () => {
  it('has no record, exam or scope; "Choose an exam"; the four scopes in plain words; importance "Not set" or 1 to 5; Save is refused', async () => {
    const { draft, rig } = showKnowledge('exam_relevance', { blank: true });
    for (const field of ['target', 'examId', 'scope', 'importance']) expect(draft()).not.toHaveProperty(field);
    expect(draft().examVersionIds).toEqual([]);
    const exam = screen.getByLabelText('Exam') as HTMLSelectElement;
    expect(within(exam).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose an exam', 'JEE Advanced', 'JEE Main']);
    const scope = screen.getByLabelText('Scope') as HTMLSelectElement;
    expect(within(scope).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a scope', 'Official (in the syllabus)', 'Prerequisite (needed to follow the syllabus)', 'Enrichment (beyond the syllabus, worth knowing)', 'Outside the syllabus']);
    expect(within(screen.getByLabelText('Importance')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Not set', '1', '2', '3', '4', '5']);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('heading', { name: 'Save was refused' });
    expect(Object.keys(rig.store.getState().records.exam_relevance)).toHaveLength(1);
  });
  it('the versions wait for an exam, then are only that exam\'s; none chosen is said as "all versions of <exam>"', () => {
    const { draft } = showKnowledge('exam_relevance', { blank: true });
    expect(screen.getByText(/Choose an exam first/)).toBeTruthy();
    set('Exam', 'exm_jee-main');
    const group = screen.getByRole('group', { name: 'Versions of JEE Main' });
    expect(within(group).getAllByRole('checkbox').map((c) => (c as HTMLInputElement).labels?.[0]?.textContent?.trim())).toEqual(['JEE Main 2026 (provisional)']);
    expect(screen.getByText('Applies to all versions of JEE Main.')).toBeTruthy();
    fireEvent.click(within(group).getByRole('checkbox', { name: 'JEE Main 2026 (provisional)' }));
    expect(draft().examVersionIds).toEqual(['exv_jee-main-2026']);
    expect(screen.getByText('Applies to: JEE Main 2026 (provisional).')).toBeTruthy();
    fireEvent.click(within(group).getByRole('checkbox', { name: 'JEE Main 2026 (provisional)' }));
    expect(draft().examVersionIds).toEqual([]);
  });
  it('changing the exam clears the versions and says so (undo brings them back)', () => {
    const { draft } = showKnowledge('exam_relevance', { blank: true });
    set('Exam', 'exm_jee-main');
    fireEvent.click(screen.getByRole('checkbox', { name: 'JEE Main 2026 (provisional)' }));
    set('Exam', 'exm_jee-advanced');
    expect(draft().examVersionIds).toEqual([]);
    expect(screen.getByRole('status', { name: 'Versions cleared' }).textContent).toMatch(/versions of JEE Main were cleared/);
  });
  it('stores the scope, the importance and the target; an importance of "Not set" removes it', async () => {
    const { draft } = showKnowledge('exam_relevance', { blank: true });
    await pickTarget(BECKMANN, 'Beckmann rearrangement of cyclohexanone oxime');
    set('Exam', 'exm_jee-main');
    set('Scope', 'outside');
    set('Importance', '3');
    expect(draft()).toMatchObject({ target: { kind: 'reaction' }, examId: 'exm_jee-main', scope: 'outside', importance: 3 });
    set('Importance', '');
    expect(draft()).not.toHaveProperty('importance');
  });
});

describe('CUR-003 and CUR-004 (the real rules, live)', () => {
  it('a version of another exam is shown, never hidden, and CUR-003 says so', async () => {
    const shown = showKnowledge('exam_relevance', { blank: true, real: true });
    await pickTarget(BECKMANN, 'Beckmann rearrangement of cyclohexanone oxime');
    set('Exam', 'exm_jee-main');
    set('Scope', 'outside');
    act(() => shown.rig.drafts.edit(shown.id, (d) => void (d.examVersionIds = ['exv_jee-advanced-2026'])));
    expect(screen.getByText(/JEE Advanced 2026 \(provisional\) is not a version of JEE Main/)).toBeTruthy();
    await settle(shown);
    expect(await screen.findByText(/belongs to a different exam than this relevance record/)).toBeTruthy();
  });
  it('a record given a different scope for the same exam and versions is a live CUR-004 warning', async () => {
    const shown = showKnowledge('exam_relevance', { blank: true, real: true });
    await pickTarget(BECKMANN, 'Beckmann rearrangement of cyclohexanone oxime');
    set('Exam', 'exm_jee-advanced');
    set('Scope', 'outside'); // the demo says "enrichment" for this exam's version; no version chosen = every version
    await settle(shown);
    await waitFor(() => expect(screen.getByText(/other relevance record give this record a different scope/)).toBeTruthy());
  });
});

describe('a seeded exam relevance', () => {
  it('opens with the record already filled in', () => {
    showKnowledge('exam_relevance', { blank: true, seed: { target: { kind: 'reaction', id: 'rxn_aniline-diazotisation' } } });
    expect(screen.getByRole('list', { name: 'Target record' }).textContent).toContain('Diazotisation of aniline');
  });
});
