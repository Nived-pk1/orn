// @vitest-environment jsdom
/**
 * The reagent profile's conditions and behaviour (step 6.6a part 4, decision C5) over the real store and session manager, on the demo's
 * potassium permanganate (Baeyer's reagent and a hot, concentrated profile): ONE summary line per profile by the arrow's own builder, the SAME
 * conditions form the stages use, a field read from text says so and Confirm removes it (RXN-015), the behaviour is rich text with no default.
 */
import { utcTime } from '@/test-support/editing-kit';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { conditionPartsOf } from '@/core/graph';
import type { CanonicalState, ConditionParameters, Reagent } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { editorRig, renderWithToasts, type EditorRig } from '@/test-support/editor-kit';
import { stubDialog } from '@/test-support/window-kit';
import type { DraftChecksPort } from './check-contracts';
import { EditorHost } from './editor-host';

beforeAll(stubDialog);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const quiet: DraftChecksPort = {
  dryRun: async (_k, _d, version) => ({ version, state: 'checked', findings: [] }),
  structure: async (_k, _d, version) => ({ version, state: 'none' }),
};
const KMNO4 = 'rgt_potassium-permanganate';
const stored = (rig: EditorRig): Reagent => rig.store.getState().records.reagent[KMNO4 as never] as Reagent;

function show(state?: CanonicalState) {
  const rig = editorRig(state === undefined ? {} : { state });
  const opened = rig.drafts.open({ kind: 'reagent', id: KMNO4 });
  if (!opened.ok) throw new Error(opened.message);
  renderWithToasts(<EditorHost port={{ ...rig.port, checks: quiet }} sessionId={opened.id} open formatTime={utcTime} onClose={vi.fn()} />);
  return { rig, id: opened.id, dialog: screen.getByRole('dialog') };
}
const draftOf = (rig: EditorRig, id: string): Reagent => rig.drafts.entry(id)?.session.draft as Reagent;
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const lineOf = (n: number): string => screen.getAllByTestId('profile-conditions')[n - 1]?.textContent ?? '';
const arrowWords = (p: ConditionParameters): string => {
  const parts = conditionPartsOf(p).map((part) => part.text);
  return parts.length === 0 ? 'No conditions on the arrow' : parts.join(' · ');
};

describe('the summary line of a profile', () => {
  it('every profile shows ONE line equal to the arrow builder over its parameters; no field is on the page until Edit conditions', () => {
    const { rig } = show();
    const profiles = stored(rig).profiles;
    expect(lineOf(1)).toBe(`Conditions: ${arrowWords(profiles[0]?.parameters as ConditionParameters)}`);
    expect(lineOf(2)).toBe(`Conditions: ${arrowWords(profiles[1]?.parameters as ConditionParameters)}`);
    expect(screen.queryByLabelText(/^Temperature kind of profile/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit conditions of profile 2' }).getAttribute('aria-expanded')).toBe('false');
  });
});

describe('the shared conditions form inside a profile', () => {
  it('edits the temperature of profile 2 (80 °C to 95 °C); the line follows at once; the other profile is untouched', () => {
    const { rig, id } = show();
    const before = stored(rig).profiles[0]?.parameters;
    fireEvent.click(screen.getByRole('button', { name: 'Edit conditions of profile 2' }));
    expect(screen.getByRole('group', { name: 'Conditions of profile 2' })).toBeTruthy();
    change('Temperature value of profile 2', '95');
    expect(draftOf(rig, id).profiles[1]?.parameters.temperature).toEqual({ kind: 'value', value: 95, unit: 'C' });
    expect(lineOf(2)).toBe(`Conditions: ${arrowWords(draftOf(rig, id).profiles[1]?.parameters as ConditionParameters)}`);
    expect(lineOf(2)).toContain('95');
    expect(draftOf(rig, id).profiles[0]?.parameters).toEqual(before);
  });

  it('a field read from text says so; Confirm removes only that one (RXN-015) and leaves the value', () => {
    const state = demoState();
    const reagent = state.records.reagent[KMNO4 as never] as Reagent;
    const profiles = reagent.profiles.map((p, at) => (at === 0 ? { ...p, parameters: { ...p.parameters, parsedFields: ['temperature', 'medium'] as ConditionParameters['parsedFields'] } } : p));
    const { rig, id } = show({ ...state, records: { ...state.records, reagent: { ...state.records.reagent, [KMNO4]: { ...reagent, profiles } } } } as unknown as CanonicalState);
    fireEvent.click(screen.getByRole('button', { name: 'Edit conditions of profile 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm temperature of profile 1' }));
    expect(draftOf(rig, id).profiles[0]?.parameters.parsedFields).toEqual(['medium']);
    expect(draftOf(rig, id).profiles[0]?.parameters.temperature).toEqual(stored(rig).profiles[0]?.parameters.temperature);
  });
});

describe('the behaviour', () => {
  it('is a rich text field with no default: absent when empty, stored as typed otherwise', () => {
    const { rig, id } = show();
    change('Behaviour of profile 1', '');
    expect('behaviour' in (draftOf(rig, id).profiles[0] ?? {})).toBe(false);
    change('Behaviour of profile 1', 'Purple to **brown** MnO_{2}');
    expect(draftOf(rig, id).profiles[0]?.behaviour).toBe('Purple to **brown** MnO_{2}');
    expect(screen.getAllByRole('region', { name: /^Preview of Behaviour of profile/ }).length).toBeGreaterThan(0);
  });
  it('Save keeps what was edited, as ONE undoable entry, and the old "kept unchanged" text is gone', async () => {
    const { rig, dialog } = show();
    expect(within(dialog).queryByText(/editing arrives in step 6\.6/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit conditions of profile 2' }));
    change('Temperature value of profile 2', '95');
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(stored(rig).profiles[1]?.parameters.temperature).toEqual({ kind: 'value', value: 95, unit: 'C' }));
    expect(rig.store.historyLabels().undo).toHaveLength(1);
  });
});
