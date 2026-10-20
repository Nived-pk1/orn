// @vitest-environment jsdom
/**
 * The Condition variants section of the reaction editor (step 6.4a part 3, D3 and D4) over the real store and session manager, on the demo's
 * ethanol + conc. H2SO4 reaction (two variants, each named by an outcome) and its aldol reaction (two variants, no stage): summary lines, only the
 * overriding fields, add and remove a field, a variant an outcome names cannot be removed and says why, one no outcome names asks first, the
 * default stage, a parsed field on a variant, and the preview's arrow following an override.
 */
import { utcTime } from '@/test-support/editing-kit';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { indexEngine } from '@/core/indexes';
import { previewOfDraft } from '@/core/graph';
import type { CanonicalState, ConditionParameters, Reaction } from '@/core/schema';
import { PHONE_QUERIES } from '@/ui/hooks';
import { demoState } from '@/test-support/app-boot-kit';
import { editorRig, renderWithToasts, type EditorRig } from '@/test-support/editor-kit';
import { must } from '@/test-support/state-fixture';
import { stubDialog } from '@/test-support/window-kit';
import type { DraftChecksPort } from './check-contracts';
import { EditorHost } from './editor-host';
import type { PreviewPort } from './preview-contracts';

beforeAll(stubDialog);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const quiet: DraftChecksPort = {
  dryRun: async (_k, _d, version) => ({ version, state: 'checked', findings: [] }),
  structure: async (_k, _d, version) => ({ version, state: 'none' }),
};
const ETHANOL = 'rxn_ethanol-conc-h2so4';
const ALDOL = 'rxn_ethanal-aldol';
const GRIGNARD = 'rxn_methylmgbr-ethanal';
const empty = (): ConditionParameters => ({ solventCharacter: [], activation: [], other: [], parsedFields: [] });

const withReaction = (id: string, change: (r: Reaction) => Reaction): CanonicalState => {
  const state = demoState();
  return { ...state, records: { ...state.records, reaction: { ...state.records.reaction, [id]: change(state.records.reaction[id as never] as Reaction) } } } as unknown as CanonicalState;
};
function previewFor(rig: EditorRig): PreviewPort {
  return {
    build: (draft) => previewOfDraft(rig.store.getState(), indexEngine.build(rig.store.getState()), draft),
    binding: undefined,
    facts: undefined,
    timers: rig.port.timers,
    names: { get: () => true, set: () => undefined, subscribe: () => () => undefined },
  };
}
function show(target: string, state?: CanonicalState) {
  const rig = editorRig(state === undefined ? {} : { state });
  const opened = rig.drafts.open({ kind: 'reaction', id: target });
  if (!opened.ok) throw new Error(opened.message);
  renderWithToasts(<EditorHost port={{ ...rig.port, checks: quiet, preview: previewFor(rig) }} sessionId={opened.id} open formatTime={utcTime} onClose={vi.fn()} />);
  return { rig, id: opened.id };
}
const draftOf = (rig: EditorRig, id: string): Reaction => rig.drafts.entry(id)?.session.draft as Reaction;
const rows = (): HTMLElement[] => screen.getAllByTestId('variant-row');
const summary = (n: number): string => screen.getAllByTestId('variant-summary')[n - 1]?.textContent ?? '';
const edit = (n: number) => fireEvent.click(screen.getByRole('button', { name: `Edit variant ${n}` }));
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('the variant summary lines', () => {
  it('each variant is ONE line: its label, the stage it overrides and what it overrides; no field is on the page', () => {
    show(ETHANOL);
    expect(rows()).toHaveLength(2);
    expect(summary(1)).toBe('1. 413 K, excess ethanol: stage 1 temperature 413 K');
    expect(summary(2)).toBe('2. 443 K, excess acid: stage 1 temperature 443 K');
    expect(screen.queryByLabelText(/^Temperature kind of variant/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit variant 1' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('a reaction with no stage says "no stage to override"', () => {
    show(ALDOL);
    expect(summary(1)).toMatch(/^1\. Base-catalysed \(dilute NaOH, cold\): no stage to override, temperature cold, basic medium/);
    edit(1);
    expect(screen.getByLabelText('Stage of variant 1')).toBeTruthy();
    expect(screen.getByText(/A variant's solvent character does not reach the arrow/)).toBeTruthy();
  });
});

describe('the overrides of a variant', () => {
  it('opening it shows ONLY the fields it overrides, with a Remove on each; the stage is not touched', () => {
    const { rig, id } = show(ETHANOL);
    edit(2);
    const form = screen.getByRole('group', { name: 'Conditions of variant 2' });
    expect(within(form).getByLabelText('Temperature kind of variant 2')).toBeTruthy();
    expect(within(form).queryByLabelText('Medium of variant 2')).toBeNull();
    expect(within(form).queryByLabelText('Pressure kind of variant 2')).toBeNull();
    const stageBefore = must(draftOf(rig, id).stages[0]).parameters;
    change('Temperature value of variant 2', '453');
    expect(must(draftOf(rig, id).conditionVariants[1]).parameters.temperature).toEqual({ kind: 'value', value: 453, unit: 'K' });
    expect(summary(2)).toBe('2. 443 K, excess acid: stage 1 temperature 453 K');
    expect(must(draftOf(rig, id).stages[0]).parameters).toEqual(stageBefore);
    expect(must(draftOf(rig, id).conditionVariants[0]).parameters.temperature).toEqual({ kind: 'value', value: 413, unit: 'K' });
  });

  it('"Add a field to override" offers the fields it does not have yet; the new one starts empty; Remove takes it out', () => {
    const { rig, id } = show(ETHANOL);
    edit(1);
    const offered = Array.from((screen.getByLabelText('Add a field to override') as HTMLSelectElement).options).map((o) => o.textContent);
    expect(offered).not.toContain('Temperature');
    expect(offered).toContain('Medium');
    expect(offered).not.toContain('Solvent character'); // a variant's solvent never reaches the arrow
    change('Add a field to override', 'medium');
    expect(screen.getByLabelText('Medium of variant 1')).toBeTruthy();
    expect((screen.getByLabelText('Medium of variant 1') as HTMLSelectElement).value).toBe('');
    expect(Object.hasOwn(must(draftOf(rig, id).conditionVariants[0]).parameters, 'medium')).toBe(false); // nothing stored until a value is chosen
    change('Medium of variant 1', 'acidic');
    expect(summary(1)).toBe('1. 413 K, excess ethanol: stage 1 temperature 413 K, acidic medium');
    fireEvent.click(screen.getByRole('button', { name: 'Remove medium override of variant 1' }));
    expect(screen.queryByLabelText('Medium of variant 1')).toBeNull();
    expect(Object.hasOwn(must(draftOf(rig, id).conditionVariants[0]).parameters, 'medium')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Remove temperature override of variant 1' }));
    expect(draftOf(rig, id).conditionVariants[0]?.parameters).toEqual(empty());
    expect(summary(1)).toBe('1. 413 K, excess ethanol: stage 1 no overrides yet');
  });

  it('the label and the stage it overrides are edited', () => {
    const { rig, id } = show(ETHANOL, withReaction(ETHANOL, (r) => ({ ...r, stages: [...r.stages, { ...must(r.stages[0]), id: 'stg_two', participantIds: [] }] }) as Reaction));
    edit(1);
    change('Label of variant 1', '410 K');
    change('Stage of variant 1', 'stg_two');
    expect(draftOf(rig, id).conditionVariants[0]).toMatchObject({ label: '410 K', stageId: 'stg_two' });
    expect(summary(1)).toBe('1. 410 K: stage 2 temperature 413 K');
  });

  it('a field read from text on a variant says so, and Confirm removes it from parsedFields', () => {
    const state = withReaction(ETHANOL, (r) => ({ ...r, conditionVariants: r.conditionVariants.map((v, at) => (at === 1 ? { ...v, parameters: { ...v.parameters, parsedFields: ['temperature'] } } : v)) }) as Reaction);
    const { rig, id } = show(ETHANOL, state);
    edit(2);
    expect(screen.getByText('Read from the text: please confirm.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm temperature of variant 2' }));
    expect(must(draftOf(rig, id).conditionVariants[1]).parameters).toMatchObject({ parsedFields: [], temperature: { kind: 'value', value: 443, unit: 'K' } });
  });
});

describe('removing and adding a variant', () => {
  it('a variant an outcome names is REFUSED in words and nothing changes', () => {
    const { rig, id } = show(ETHANOL);
    const button = screen.getByRole('button', { name: 'Remove variant 2' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(within(rows()[1] as HTMLElement).getAllByText("Outcome 2 holds only under '443 K, excess acid'; change the outcome's 'Holds under' first.").length).toBeGreaterThan(0);
    fireEvent.click(button);
    expect(draftOf(rig, id).conditionVariants).toHaveLength(2);
    expect(screen.queryByRole('group', { name: 'Remove variant 2?' })).toBeNull();
  });

  it('a new variant needs its label; the only stage is its default; a variant no outcome names ASKS first (Cancel keeps it)', () => {
    const { rig, id } = show(ETHANOL);
    const add = screen.getByRole('button', { name: 'Add variant' });
    expect(add.getAttribute('aria-disabled')).toBe('true'); // no label yet
    expect(screen.queryByLabelText('Stage it overrides')).toBeNull(); // exactly one stage: no choice
    expect(screen.getByText('A new variant overrides stage 1, the only stage.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Label of a new variant (required)'), { target: { value: '453 K' } });
    fireEvent.click(add);
    const added = must(draftOf(rig, id).conditionVariants[2]);
    expect(added).toMatchObject({ label: '453 K', stageId: must(draftOf(rig, id).stages[0]).id, participantIds: [], parameters: empty() });
    expect(summary(3)).toBe('3. 453 K: stage 1 no overrides yet');
    expect(screen.getByText('Variant 3 was added; it overrides nothing yet. Add a field to override.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove variant 3' }));
    const ask = screen.getByRole('group', { name: 'Remove variant 3?' });
    expect(within(ask).getByText(/No outcome names variant 3\./)).toBeTruthy();
    fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(draftOf(rig, id).conditionVariants).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Remove variant 3' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Remove variant 3?' })).getByRole('button', { name: 'Remove the variant' }));
    expect(draftOf(rig, id).conditionVariants).toHaveLength(2);
  });

  it('with two stages the stage must be CHOSEN; without a stage the variant has none', () => {
    const { rig, id } = show(GRIGNARD);
    fireEvent.change(screen.getByLabelText('Label of a new variant (required)'), { target: { value: 'cold' } });
    const add = screen.getByRole('button', { name: 'Add variant' });
    expect(add.getAttribute('aria-disabled')).toBe('true');
    fireEvent.change(screen.getByLabelText('Stage it overrides'), { target: { value: must(draftOf(rig, id).stages[1]).id } });
    fireEvent.click(add);
    expect(draftOf(rig, id).conditionVariants.at(-1)).toMatchObject({ label: 'cold', stageId: must(draftOf(rig, id).stages[1]).id });
  });

  it('a variant that lists participants says they become common when it is removed', () => {
    const state = withReaction(GRIGNARD, (r) => ({ ...r, conditionVariants: [{ id: 'cvr_p', label: 'only here', stageId: must(r.stages[0]).id, parameters: empty(), participantIds: [must(r.participants[0]).id] }] }) as unknown as Reaction);
    show(GRIGNARD, state);
    fireEvent.click(screen.getByRole('button', { name: 'Remove variant 1' }));
    expect(within(screen.getByRole('group', { name: 'Remove variant 1?' })).getByText(/It lists 1 participant present only under it; they become common to every condition\./)).toBeTruthy();
  });

  it('Up and Down reorder the variants (the outcomes name them by ID, so nothing else changes)', () => {
    const { rig, id } = show(ETHANOL);
    const before = draftOf(rig, id);
    fireEvent.click(screen.getByRole('button', { name: 'Move variant 1 down' }));
    expect(draftOf(rig, id).conditionVariants.map((v) => v.id)).toEqual(before.conditionVariants.map((v) => v.id).reverse());
    expect(draftOf(rig, id).outcomes).toEqual(before.outcomes);
    expect(screen.getByRole('button', { name: 'Move variant 1 up' }).getAttribute('aria-disabled')).toBe('true');
  });
});

describe('the preview follows the variants as the card does', () => {
  it("an override edit changes the arrow text of the outcome's equation after the 400 ms", async () => {
    const { rig } = show(ETHANOL);
    const preview = (): string => screen.getByRole('region', { name: 'Preview' }).textContent ?? '';
    expect(preview()).toContain('443 K');
    edit(2);
    change('Temperature value of variant 2', '453');
    await act(async () => void rig.ui.fireAfter(400));
    expect(preview()).toContain('453 K');
    expect(preview()).not.toContain('443 K');
    expect(preview()).toContain('413 K');
  });
});

describe('on a phone', () => {
  it('the variant form is stacked', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    show(ETHANOL);
    fireEvent.click(screen.getByRole('button', { name: /Condition variants/ })); // a phone starts with this section closed
    edit(1);
    expect(screen.getByRole('group', { name: 'Conditions of variant 1' }).className).toContain('stacked');
  });
});
