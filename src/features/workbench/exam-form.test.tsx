// @vitest-environment jsdom
/**
 * The exam editor (exams step part 2, X1): the exam's fields as the schema types them (name, short name, authority, notes), its versions
 * listed as summary lines with "Open", and "New version of this exam" (keeps the draft, opens a NEW exam version with the exam filled in).
 */
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { showKnowledge } from '@/test-support/knowledge-kit';
import { stubDialog } from '@/test-support/window-kit';

beforeAll(stubDialog);
afterEach(cleanup);

const set = (label: string | RegExp, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('a new exam', () => {
  it('has the schema fields; the name starts empty and Save is refused until it is typed', async () => {
    const { draft, rig } = showKnowledge('exam', { blank: true });
    expect(draft()).toMatchObject({ kind: 'exam', name: '' });
    for (const label of ['Name (required)', 'Short name', 'Authority']) expect(screen.getByLabelText(label)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('heading', { name: 'Save was refused' });
    expect(Object.keys(rig.store.getState().records.exam)).toHaveLength(2);
  });
  it('stores the texts exactly as given; an empty optional text is removed', () => {
    const { draft } = showKnowledge('exam', { blank: true });
    set('Name (required)', 'Test board exam');
    set('Short name', 'TBE');
    set('Authority', 'A board');
    expect(draft()).toMatchObject({ name: 'Test board exam', shortName: 'TBE', authority: 'A board' });
    set('Short name', '');
    expect(draft()).not.toHaveProperty('shortName');
  });
  it('says there are no versions yet, and "New version of this exam" waits for the first Save', () => {
    showKnowledge('exam', { blank: true });
    expect(screen.getByText('This exam has no versions yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New version of this exam' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: 'New version of this exam', description: 'save the exam first' })).toBeTruthy();
  });
});

describe('a stored exam', () => {
  it('lists its versions as "label, status, n units"; Open asks for that version editor', () => {
    const { editRecord } = showKnowledge('exam', { target: 'exm_jee-main' });
    const versions = within(screen.getByRole('list', { name: 'Versions of this exam' }));
    expect(versions.getAllByRole('listitem')[0]?.textContent).toContain('JEE Main 2026 (provisional) · provisional · 11 units');
    fireEvent.click(versions.getByRole('button', { name: 'Open JEE Main 2026 (provisional)' }));
    expect(editRecord).toHaveBeenCalledWith({ kind: 'exam_version', id: 'exv_jee-main-2026' });
  });
  it('"New version of this exam" keeps the draft and opens a NEW exam version with the exam filled in', () => {
    const { start } = showKnowledge('exam', { target: 'exm_jee-main' });
    fireEvent.click(screen.getByRole('button', { name: 'New version of this exam' }));
    expect(start).toHaveBeenCalledWith('exam_version', { examId: 'exm_jee-main' });
  });
});
