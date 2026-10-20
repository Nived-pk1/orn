// @vitest-environment jsdom
/**
 * The stage conditions of the reaction editor (step 6.4a part 2, D1, D2 and D4) over the real store and session manager: each stage shows ONE
 * summary line built by the arrow's own builder; Edit conditions opens every field the schema has (temperature as a value, a range or a word;
 * pressure; time; medium; solvent character; anhydrous; light; atmosphere; activation; other qualifiers; free text); values are kept exactly as
 * typed; a field read from text says so, Confirm and editing both confirm it; a phone stacks the fields.
 */
import { utcTime } from '@/test-support/editing-kit';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { arrowTextOf } from '@/core/graph';
import type { CanonicalState, ConditionParameters, Reaction } from '@/core/schema';
import { PHONE_QUERIES } from '@/ui/hooks';
import { demoState } from '@/test-support/app-boot-kit';
import { editorRig, renderWithToasts, type EditorRig } from '@/test-support/editor-kit';
import { must } from '@/test-support/state-fixture';
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
const GRIGNARD = 'rxn_methylmgbr-ethanal';
const empty = (): ConditionParameters => ({ solventCharacter: [], activation: [], other: [], parsedFields: [] });

const withStages = (id: string, parameters: readonly ConditionParameters[]): CanonicalState => {
  const state = demoState();
  const base = state.records.reaction[id as never] as Reaction;
  const stages = parameters.map((p, at) => ({ ...must(base.stages[at] ?? base.stages[0]), id: `stg_t${at}`, participantIds: at === 0 ? base.participants.map((x) => x.id) : [], parameters: p }));
  return { ...state, records: { ...state.records, reaction: { ...state.records.reaction, [id]: { ...base, stages } } } } as unknown as CanonicalState;
};
function show(state?: CanonicalState, target = GRIGNARD) {
  const rig = editorRig(state === undefined ? {} : { state });
  const opened = rig.drafts.open({ kind: 'reaction', id: target });
  if (!opened.ok) throw new Error(opened.message);
  renderWithToasts(<EditorHost port={{ ...rig.port, checks: quiet }} sessionId={opened.id} open formatTime={utcTime} onClose={vi.fn()} />);
  return { rig, id: opened.id };
}
const draftOf = (rig: EditorRig, id: string): Reaction => rig.drafts.entry(id)?.session.draft as Reaction;
const params = (rig: EditorRig, id: string, at = 0): ConditionParameters => must(draftOf(rig, id).stages[at]).parameters;
const openStage = (n: number): HTMLElement => {
  fireEvent.click(screen.getByRole('button', { name: `Edit conditions of stage ${n}` }));
  return screen.getByRole('group', { name: `Conditions of stage ${n}` });
};
const summary = (n: number): string => screen.getAllByTestId('stage-conditions')[n - 1]?.textContent ?? '';
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('the summary line of a stage', () => {
  it('every stage shows ONE line, built by the arrow\'s own builder, and no field is on the page until Edit conditions', () => {
    show(withStages(GRIGNARD, [{ ...empty(), temperature: { kind: 'range', min: 0, max: 5, unit: 'C' }, medium: 'acidic' }, { ...empty(), solventCharacter: ['aqueous'] }]));
    expect(summary(1)).toBe('Conditions: 0–5 °C · acidic medium');
    expect(summary(2)).toBe('Conditions: No conditions on the arrow');
    expect(screen.queryByLabelText(/^Temperature kind of stage/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit conditions of stage 1' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('equals the card\'s arrow text for the same parameters', () => {
    const parameters: ConditionParameters = { ...empty(), temperature: { kind: 'value', value: 443, unit: 'K' }, pressure: { kind: 'qualitative', value: 'high' }, medium: 'basic' };
    show(withStages(GRIGNARD, [parameters]));
    const reaction = { ...(demoState().records.reaction[GRIGNARD as never] as Reaction), participants: [], stages: [{ id: 'stg_t0', kind: 'reaction', participantIds: [], parameters, }], conditionVariants: [], outcomes: [] } as unknown as Reaction;
    const arrow = arrowTextOf(reaction, { schemes: [], conditionVariantIds: [], describe: () => undefined, shownAsNode: () => true });
    expect(summary(1)).toBe(`Conditions: ${arrow.below.filter((part) => part.kind === 'condition').map((part) => part.text).join(' · ')}`);
  });

  it('follows the edit at once (one line, the same words)', () => {
    show(withStages(GRIGNARD, [empty()]));
    openStage(1);
    change('Medium of stage 1', 'acidic');
    expect(summary(1)).toBe('Conditions: acidic medium');
  });
});

describe('the conditions form', () => {
  it('temperature as a VALUE keeps the number exactly as typed with its unit; a half-typed value is left out of the line', () => {
    const { rig, id } = show(withStages(GRIGNARD, [empty()]));
    openStage(1);
    change('Temperature kind of stage 1', 'value');
    expect(params(rig, id).temperature).toEqual({ kind: 'value' }); // starts empty: no unit, no number guessed
    change('Temperature value of stage 1', '443');
    expect(summary(1)).toBe('Conditions: No conditions on the arrow');
    change('Temperature unit of stage 1', 'K');
    expect(params(rig, id).temperature).toEqual({ kind: 'value', value: 443, unit: 'K' });
    expect(summary(1)).toBe('Conditions: 443 K');
    change('Temperature value of stage 1', '-10.50');
    expect(must(params(rig, id).temperature)).toMatchObject({ value: -10.5, unit: 'K' }); // no conversion, the unit is kept
  });

  it('temperature as a RANGE and as a WORD; "Not stated" removes it', () => {
    const { rig, id } = show(withStages(GRIGNARD, [empty()]));
    openStage(1);
    change('Temperature kind of stage 1', 'range');
    change('Temperature minimum of stage 1', '0');
    change('Temperature maximum of stage 1', '5');
    change('Temperature unit of stage 1', 'C');
    expect(params(rig, id).temperature).toEqual({ kind: 'range', min: 0, max: 5, unit: 'C' });
    expect(summary(1)).toBe('Conditions: 0–5 °C');
    change('Temperature kind of stage 1', 'qualitative');
    expect(screen.queryByLabelText('Temperature minimum of stage 1')).toBeNull();
    change('Temperature word of stage 1', 'reflux');
    expect(params(rig, id).temperature).toEqual({ kind: 'qualitative', value: 'reflux' });
    expect(summary(1)).toBe('Conditions: reflux');
    change('Temperature kind of stage 1', '');
    expect(Object.hasOwn(params(rig, id), 'temperature')).toBe(false);
  });

  it('pressure and time: their own units and words; time has no range', () => {
    const { rig, id } = show(withStages(GRIGNARD, [empty()]));
    openStage(1);
    change('Pressure kind of stage 1', 'value');
    change('Pressure value of stage 1', '60');
    change('Pressure unit of stage 1', 'atm');
    change('Time kind of stage 1', 'value');
    change('Time value of stage 1', '2');
    change('Time unit of stage 1', 'h');
    expect(params(rig, id)).toMatchObject({ pressure: { kind: 'value', value: 60, unit: 'atm' }, time: { kind: 'value', value: 2, unit: 'h' } });
    expect(summary(1)).toBe('Conditions: 60 atm · 2 h');
    const kinds = Array.from((screen.getByLabelText('Time kind of stage 1') as HTMLSelectElement).options).map((o) => o.value);
    expect(kinds).toEqual(['', 'value', 'qualitative']);
    expect(screen.queryByLabelText('Temperature unit of stage 1')).toBeNull(); // temperature is Not stated: nothing to choose
  });

  it('medium, light, atmosphere, anhydrous, solvent character, activation, the qualifiers and the free text', () => {
    const { rig, id } = show(withStages(GRIGNARD, [empty()]));
    const form = openStage(1);
    change('Medium of stage 1', 'acidic');
    change('Light of stage 1', 'hv');
    change('Atmosphere of stage 1', 'nitrogen');
    change('Anhydrous of stage 1', 'no');
    fireEvent.click(within(form).getByLabelText('Solvent character: aqueous (stage 1)'));
    fireEvent.click(within(form).getByLabelText('Activation: microwave (stage 1)'));
    fireEvent.click(within(form).getByRole('button', { name: 'Add qualifier' }));
    fireEvent.change(within(form).getByLabelText('Qualifier 1'), { target: { value: 'sealed tube' } });
    change('Free text of stage 1', 'as in the textbook');
    expect(params(rig, id)).toMatchObject({ medium: 'acidic', light: 'hv', atmosphere: 'nitrogen', anhydrous: false, solventCharacter: ['aqueous'], activation: ['microwave'], other: ['sealed tube'], text: 'as in the textbook' });
    expect(summary(1)).toBe('Conditions: hν · acidic medium · microwave · N2 · sealed tube');
    change('Anhydrous of stage 1', '');
    change('Medium of stage 1', '');
    fireEvent.click(within(form).getByLabelText('Solvent character: aqueous (stage 1)'));
    expect(Object.hasOwn(params(rig, id), 'anhydrous')).toBe(false);
    expect(Object.hasOwn(params(rig, id), 'medium')).toBe(false);
    expect(params(rig, id).solventCharacter).toEqual([]);
  });

  it('one stage is open at a time; each stage edits its OWN parameters', () => {
    const { rig, id } = show(withStages(GRIGNARD, [empty(), empty()]));
    openStage(1);
    change('Medium of stage 1', 'basic');
    openStage(2);
    expect(screen.queryByRole('group', { name: 'Conditions of stage 1' })).toBeNull();
    change('Medium of stage 2', 'acidic');
    expect(params(rig, id, 0).medium).toBe('basic');
    expect(params(rig, id, 1).medium).toBe('acidic');
  });
});

describe('fields read from text (RXN-015)', () => {
  const parsedState = () => withStages(GRIGNARD, [{ ...empty(), temperature: { kind: 'value', value: 443, unit: 'K' }, medium: 'acidic', parsedFields: ['temperature', 'medium'] }]);

  it('says so on exactly those fields; Confirm removes only that one, as ONE undoable edit, and leaves the value', () => {
    const { rig, id } = show(parsedState());
    const form = openStage(1);
    expect(within(form).getAllByText('Read from the text: please confirm.')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm temperature of stage 1' }));
    expect(params(rig, id)).toMatchObject({ temperature: { kind: 'value', value: 443, unit: 'K' }, medium: 'acidic', parsedFields: ['medium'] });
    expect(within(form).getAllByText('Read from the text: please confirm.')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Confirm temperature of stage 1' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(params(rig, id).parsedFields).toEqual(['temperature', 'medium']);
  });

  it('editing a parsed field confirms it, and the form says so in words', () => {
    const { rig, id } = show(parsedState());
    const form = openStage(1);
    expect(within(form).getByText(/editing a field also confirms it/i)).toBeTruthy();
    change('Medium of stage 1', 'basic');
    expect(params(rig, id)).toMatchObject({ medium: 'basic', parsedFields: ['temperature'] });
  });

  it('the review state of the reaction is not changed by the editor', () => {
    const { rig, id } = show(parsedState());
    const before = draftOf(rig, id).review;
    openStage(1);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm temperature of stage 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm medium of stage 1' }));
    expect(params(rig, id).parsedFields).toEqual([]);
    expect(draftOf(rig, id).review).toEqual(before);
  });
});

describe('on a phone', () => {
  it('the conditions form is stacked and the fields are real controls', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    show(withStages(GRIGNARD, [empty()]));
    const form = openStage(1);
    expect(form.className).toContain('stacked');
    change('Temperature kind of stage 1', 'value');
    expect(within(form).getByLabelText('Temperature value of stage 1')).toBeTruthy();
    expect(within(form).getByLabelText('Temperature unit of stage 1')).toBeTruthy();
  });
});
