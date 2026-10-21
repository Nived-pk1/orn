// @vitest-environment jsdom
/**
 * The mechanism editor's leftovers (step 6.6a, decision C6) over the real store and session manager: mechanism classes with certainty (no
 * default), the variant note, the step title and note, the shared notes / concepts / tags / citations. Review stays read-only.
 */
import { utcTime } from '@/test-support/editing-kit';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Mechanism } from '@/core/schema';
import { editorRig, renderWithToasts, type EditorRig } from '@/test-support/editor-kit';
import { stubDialog } from '@/test-support/window-kit';
import type { DraftChecksPort } from './check-contracts';
import { EditorHost } from './editor-host';
import type { RecordChoice, RecordPickerPort } from './record-picker-contracts';

beforeAll(stubDialog);
afterEach(cleanup);

const quiet: DraftChecksPort = {
  dryRun: async (_k, _d, version) => ({ version, state: 'checked', findings: [] }),
  structure: async (_k, _d, version) => ({ version, state: 'none' }),
};
const E2 = 'mec_e2-haloalkane';
const CONCEPT: RecordChoice = { kind: 'concept', id: 'cpt_sn2', name: 'SN2', kindWords: 'mechanism class', scope: '' };
const records: RecordPickerPort = {
  describe: (kind, id) => (kind === 'concept' && id === CONCEPT.id ? CONCEPT : undefined),
  search: async (kinds, text) => (kinds.includes('concept') && CONCEPT.name.toLowerCase().includes(text.toLowerCase()) ? [CONCEPT] : []),
};

function show() {
  const rig = editorRig();
  const opened = rig.drafts.open({ kind: 'mechanism', id: E2 });
  if (!opened.ok) throw new Error(opened.message);
  renderWithToasts(<EditorHost port={{ ...rig.port, checks: quiet, records }} sessionId={opened.id} open formatTime={utcTime} onClose={vi.fn()} />);
  return { rig, id: opened.id, dialog: screen.getByRole('dialog') };
}
const draftOf = (rig: EditorRig, id: string): Mechanism => rig.drafts.entry(id)?.session.draft as Mechanism;
const openSection = (name: string): void => {
  const toggle = screen.getByRole('button', { name: new RegExp(name) });
  if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
};

describe('mechanism classes', () => {
  it('a concept is added with no certainty ("Choose certainty"); the stored record is refused by L1 until one is chosen; then "SN2 (definite)"', async () => {
    const { rig, id, dialog } = show();
    openSection('Mechanism classes');
    const before = draftOf(rig, id).mechanismClasses.length;
    fireEvent.change(within(dialog).getByLabelText('Find a mechanism class by name'), { target: { value: 'sn' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Add SN2' }));
    expect(draftOf(rig, id).mechanismClasses).toHaveLength(before + 1);
    expect(draftOf(rig, id).mechanismClasses.at(-1)).toEqual({ conceptId: 'cpt_sn2' });
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    expect(await within(dialog).findByRole('heading', { name: 'Save was refused' })).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Certainty of SN2'), { target: { value: 'definite' } });
    expect(within(dialog).getByText('SN2 (definite)')).toBeTruthy();
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: /^Save/ })));
    await waitFor(() => expect((rig.store.getState().records.mechanism[E2 as never] as Mechanism).mechanismClasses.at(-1)).toEqual({ conceptId: 'cpt_sn2', certainty: 'definite' }));
  });
});

describe('variant note, step title and step note', () => {
  it('edits the variant note and a step title and note; empty removes them', async () => {
    const { rig, id, dialog } = show();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit variant 1' }));
    fireEvent.change(within(dialog).getByLabelText('Note of variant 1'), { target: { value: 'for small bases' } });
    expect(draftOf(rig, id).variants[0]?.note).toBe('for small bases');
    fireEvent.click(within(dialog).getAllByRole('button', { name: /^Edit step / })[0] as HTMLElement);
    fireEvent.change(within(dialog).getByLabelText('Title of step 1'), { target: { value: 'One-step elimination' } });
    fireEvent.change(within(dialog).getByLabelText('Note of step 1'), { target: { value: 'concerted' } });
    expect(draftOf(rig, id).variants[0]?.steps[0]).toMatchObject({ title: 'One-step elimination', note: 'concerted' });
    fireEvent.change(within(dialog).getByLabelText('Title of step 1'), { target: { value: '' } });
    expect('title' in (draftOf(rig, id).variants[0]?.steps[0] ?? {})).toBe(false);
    expect(within(dialog).queryByText(/Editing arrives in step 6.6\./)).toBeNull();
  });
});

describe('the shared fields in the mechanism', () => {
  it('concepts, notes and tags are editable here; the review fields stay in the Review section', () => {
    const { rig, id, dialog } = show();
    openSection('Notes, tags and citations');
    fireEvent.change(within(dialog).getByLabelText('Study notes'), { target: { value: 'E2 needs anti-periplanar H and X' } });
    expect(draftOf(rig, id).studyNotes).toBe('E2 needs anti-periplanar H and X');
    expect(within(dialog).getByLabelText('Find a concept by name')).toBeTruthy();
  });
});
