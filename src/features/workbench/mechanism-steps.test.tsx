// @vitest-environment jsdom
/**
 * The mechanism editor's steps and their rows (step 6.5a part 4, D4) over the real store and session manager, on the demo mechanisms: summary lines,
 * step kinds, species rows (a record through the picker, a label, an inline atom-mapped structure through the structure panel), bonds and electron
 * movements chosen from the atom maps the chem worker finds in THIS step, "Add atom-mapped structures to this step first", CHEM-008 marking its row,
 * and the phone's stacked rows.
 */
import { utcTime } from '@/test-support/editing-kit';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { toFinding } from '@/chem/checks/rules';
import type { ParseOutcome } from '@/chem/contracts';
import type { Mechanism } from '@/core/schema';
import { PHONE_QUERIES } from '@/ui/hooks';
import { editorRig, renderWithToasts, type EditorRig } from '@/test-support/editor-kit';
import { stubDialog } from '@/test-support/window-kit';
import type { DraftChecksPort } from './check-contracts';
import { EditorHost } from './editor-host';
import type { RecordChoice, RecordPickerPort } from './record-picker-contracts';
import type { StructurePort } from './structure-contracts';

beforeAll(stubDialog);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SN2 = 'mec_sn2-haloalkane';
const ALDOL = 'mec_aldol-ethanal';
const quiet: DraftChecksPort = {
  dryRun: async (_k, _d, version) => ({ version, state: 'checked', findings: [] }),
  structure: async (_k, _d, version) => ({ version, state: 'none' }),
};
/** A stand-in for the chem worker: the atom maps are the `:n` numbers in the text (the worker's own reading is tested in src/chem). */
const parse: StructurePort['parse'] = async (structure): Promise<ParseOutcome> => ({
  ok: true,
  facts: { atomMaps: [...structure.value.matchAll(/:(\d+)\]/g)].map((m) => Number(m[1])).sort((a, b) => a - b), warnings: [] },
});
const HYDROXIDE: RecordChoice = { kind: 'species', id: 'spc_hydroxide', name: 'Hydroxide', kindWords: 'compound', scope: '' };
const records: RecordPickerPort = { search: async () => [HYDROXIDE], describe: (kind, id) => (kind === HYDROXIDE.kind && id === HYDROXIDE.id ? HYDROXIDE : undefined) };

function show(target: string, options: { phone?: boolean; checks?: DraftChecksPort } = {}) {
  if (options.phone === true) {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false }));
  }
  const rig = editorRig();
  const opened = rig.drafts.open({ kind: 'mechanism', id: target });
  if (!opened.ok) throw new Error(opened.message);
  renderWithToasts(<EditorHost port={{ ...rig.port, checks: options.checks ?? quiet, structure: { parse }, records }} sessionId={opened.id} open formatTime={utcTime} onClose={vi.fn()} />);
  return { rig, id: opened.id };
}
const draftOf = (rig: EditorRig, id: string): Mechanism => rig.drafts.entry(id)?.session.draft as Mechanism;
const stepOf = (rig: EditorRig, id: string, v = 0, s = 0) => (draftOf(rig, id).variants[v]?.steps[s] as Mechanism['variants'][number]['steps'][number]);
const openVariant = (n: number) => fireEvent.click(screen.getByRole('button', { name: `Edit variant ${n}` }));
const openStep = (n: number) => fireEvent.click(screen.getByRole('button', { name: `Edit step ${n}` }));
const stepLines = (): string[] => screen.getAllByTestId('step-summary').map((el) => el.textContent ?? '');
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const optionValues = (label: string): string[] => within(screen.getByLabelText(label)).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
const isOff = (el: HTMLElement): boolean => el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled;

describe('the step summary lines', () => {
  it('each step is ONE line "Step <n> · <kinds> · rate-determining · reversible"; nothing else is on the page', () => {
    show(ALDOL);
    openVariant(1);
    expect(stepLines()).toEqual(['Step 1 · proton transfer · reversible', 'Step 2 · nucleophilic attack, bond formation · rate-determining · reversible', 'Step 3 · proton transfer · reversible']);
    expect(screen.queryByLabelText('Role of species 1')).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit step 1' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('Edit opens one step at a time', () => {
    show(ALDOL);
    openVariant(1);
    openStep(1);
    expect(screen.getByRole('group', { name: 'Species of step 1' })).toBeTruthy();
    openStep(2);
    expect(screen.queryByRole('group', { name: 'Species of step 1' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Species of step 2' })).toBeTruthy();
  });
});

describe('adding, moving and removing steps', () => {
  it('Add step appends an empty step and opens it', () => {
    const { rig, id } = show(SN2);
    openVariant(1);
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    const steps = draftOf(rig, id).variants[0]?.steps ?? [];
    expect(steps).toHaveLength(2);
    expect(steps[1]).toMatchObject({ stepKinds: [], species: [], bondsFormed: [], bondsBroken: [], electronMovements: [] });
    expect(steps[1]?.id).toMatch(/^mst_/);
    expect(stepLines()[1]).toBe('Step 2');
    expect(screen.getByRole('group', { name: 'Species of step 2' })).toBeTruthy();
  });

  it('Up and Down reorder; Remove asks first', () => {
    const { rig, id } = show(ALDOL);
    openVariant(1);
    const first = draftOf(rig, id).variants[0]?.steps[0]?.id;
    expect(isOff(screen.getByRole('button', { name: 'Move step 1 up' }))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Move step 1 down' }));
    expect(draftOf(rig, id).variants[0]?.steps[1]?.id).toBe(first);
    fireEvent.click(screen.getByRole('button', { name: 'Remove step 3' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Remove step 3?' })).getByRole('button', { name: 'Cancel' }));
    expect(draftOf(rig, id).variants[0]?.steps).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Remove step 3' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Remove step 3?' })).getByRole('button', { name: 'Remove the step' }));
    expect(draftOf(rig, id).variants[0]?.steps).toHaveLength(2);
  });
});

describe('the fields of one step', () => {
  it('step kinds are a multi-choice of the schema values; the flags, the stereochemical event and the description are edited as typed', () => {
    const { rig, id } = show(SN2);
    openVariant(1);
    openStep(1);
    const kinds = within(screen.getByRole('group', { name: 'Step kinds of step 1' }));
    expect(kinds.getAllByRole('checkbox')).toHaveLength(18);
    expect((kinds.getByRole('checkbox', { name: 'Nucleophilic attack' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(kinds.getByRole('checkbox', { name: 'Elimination' }));
    fireEvent.click(kinds.getByRole('checkbox', { name: 'Nucleophilic attack' }));
    expect(stepOf(rig, id).stepKinds).toEqual(['leaving_group_departure', 'elimination']);
    const rate = within(screen.getByRole('group', { name: 'Rate-determining' }));
    const rev = within(screen.getByRole('group', { name: 'Reversible' }));
    expect(rev.getAllByRole('radio').map((r) => (r as HTMLInputElement).labels?.[0]?.textContent)).toEqual(['Not stated', 'Yes', 'No']);
    expect((rev.getByRole('radio', { name: 'Not stated' }) as HTMLInputElement).checked).toBe(Object.hasOwn(stepOf(rig, id), 'reversible') === false);
    fireEvent.click(rev.getByRole('radio', { name: 'Yes' }));
    expect(stepOf(rig, id).reversible).toBe(true);
    fireEvent.click(rate.getByRole('radio', { name: 'No' }));
    expect(stepOf(rig, id).isRateDetermining).toBe(false);
    expect(screen.getByTestId('step-summary').textContent).toContain('not rate-determining');
    fireEvent.click(rate.getByRole('radio', { name: 'Not stated' }));
    expect(Object.hasOwn(stepOf(rig, id), 'isRateDetermining')).toBe(false);
    expect(screen.getByTestId('step-summary').textContent).not.toContain('rate-determining');
    change('Stereochemical event of step 1', 'Inversion ');
    expect(stepOf(rig, id).stereochemicalEvent).toBe('Inversion ');
    fireEvent.change(screen.getByRole('textbox', { name: 'Description of step 1' }), { target: { value: 'Backside *attack*.' } });
    expect(stepOf(rig, id).description).toBe('Backside *attack*.');
    expect(within(screen.getByRole('region', { name: 'Preview of Description of step 1' })).getByText('attack').tagName).toBe('EM');
    expect(screen.getByText(/Title: Hydroxide attacks the carbon opposite the leaving group/)).toBeTruthy();
    expect(screen.getAllByText(/Editing arrives in step 6\.6/).length).toBeGreaterThan(0);
  });
});

describe('species rows', () => {
  it('rows show what they hold: role, label and the structure; a role is chosen from the schema values', () => {
    const { rig, id } = show(SN2);
    openVariant(1);
    openStep(1);
    expect(within(screen.getByLabelText('Role of species 1')).getAllByRole('option').map((o) => (o as HTMLOptionElement).value)).toEqual(['reactant', 'reagent', 'intermediate', 'transition_state', 'product', 'leaving_group', 'catalyst']);
    expect((screen.getByLabelText('Label of species 1') as HTMLInputElement).value).toBe('Hydroxide');
    change('Role of species 1', 'catalyst');
    expect(stepOf(rig, id).species[0]?.role).toBe('catalyst');
  });

  it('a new row has no role until one is chosen; it can be given as a record, as a label, and as an inline mapped structure', async () => {
    const { rig, id } = show(SN2);
    openVariant(1);
    openStep(1);
    fireEvent.click(screen.getByRole('button', { name: 'Add species' }));
    const k = stepOf(rig, id).species.length;
    expect(stepOf(rig, id).species[k - 1]).toEqual({});
    expect((screen.getByLabelText(`Role of species ${k}`) as HTMLSelectElement).value).toBe('');
    change(`Role of species ${k}`, 'reagent');
    change(`Label of species ${k}`, 'Water');
    // a record, through the generic picker
    fireEvent.change(screen.getByLabelText(`Find the record of species ${k} by name`), { target: { value: 'hyd' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Add Hydroxide' }));
    expect(stepOf(rig, id).species[k - 1]).toEqual({ role: 'reagent', label: 'Water', ref: { kind: 'species', id: 'spc_hydroxide' } });
    // an inline structure with an atom map, through the structure panel
    fireEvent.click(screen.getByRole('button', { name: `Add structure to species ${k}` }));
    fireEvent.change(screen.getByLabelText(`SMILES, CXSMILES or molfile of species ${k}`), { target: { value: '[OH2:7]' } });
    expect(stepOf(rig, id).species[k - 1]?.structure).toEqual({ format: 'smiles', value: '[OH2:7]' });
    // the new map is offered to the bonds of this step once the structure is read
    // the 400 ms timers that wait: the live checks', the structure panel's own reading and the step's map listing
    act(() => {
      while (rig.ui.fireAfter(400)) continue;
    });
    await waitFor(() => expect(optionValues('Atoms of bond formed 1')).toContain('1-7'));
  });

  it('a record can be removed from a row (the label and structure stay)', () => {
    const { rig, id } = show(SN2);
    openVariant(1);
    openStep(1);
    fireEvent.click(screen.getByRole('button', { name: 'Add species' }));
    const k = stepOf(rig, id).species.length;
    change(`Label of species ${k}`, 'X');
    act(() => void rig.drafts.edit(id, (draft) => void (((draft as unknown as Mechanism).variants[0]?.steps[0]?.species[k - 1] as { ref?: unknown }).ref = { kind: 'species', id: 'spc_hydroxide' })));
    fireEvent.click(screen.getByRole('button', { name: `Remove record of species ${k}` }));
    expect(stepOf(rig, id).species[k - 1]).toEqual({ label: 'X' });
  });

  it('Up, Down and Remove act on a row', () => {
    const { rig, id } = show(SN2);
    openVariant(1);
    openStep(1);
    fireEvent.click(screen.getByRole('button', { name: 'Move species 1 down' }));
    expect(stepOf(rig, id).species.map((x) => x.label)).toEqual(['(R)-2-Bromobutane', 'Hydroxide', '(S)-Butan-2-ol', 'Bromide']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove species 4' }));
    expect(stepOf(rig, id).species).toHaveLength(3);
  });
});

describe('bonds and electron movements are chosen from the step atom maps', () => {
  it('a bond is chosen from the pairs of the maps found in THIS step; its order from 1, 2, 3 or not stated', async () => {
    const { rig, id } = show(SN2);
    openVariant(1);
    openStep(1);
    await waitFor(() => expect(optionValues('Atoms of bond formed 1')).toEqual(['1-2', '1-3', '2-3']));
    expect((screen.getByLabelText('Atoms of bond formed 1') as HTMLSelectElement).value).toBe('1-2');
    change('Atoms of bond formed 1', '2-3');
    expect(stepOf(rig, id).bondsFormed[0]).toEqual({ atoms: [2, 3], order: 1 });
    change('Order of bond formed 1', '');
    expect(stepOf(rig, id).bondsFormed[0]).toEqual({ atoms: [2, 3] });
    fireEvent.click(screen.getByRole('button', { name: 'Add bond broken' }));
    expect(stepOf(rig, id).bondsBroken).toHaveLength(2);
    change('Atoms of bond broken 2', '1-3');
    expect(stepOf(rig, id).bondsBroken[1]).toEqual({ atoms: [1, 3] });
    fireEvent.click(screen.getByRole('button', { name: 'Remove bond broken 2' }));
    expect(stepOf(rig, id).bondsBroken).toHaveLength(1);
  });

  it('an electron movement chooses its two sites (atom, lone pair, radical, bond) and 1 or 2 electrons', async () => {
    const { rig, id } = show(SN2);
    openVariant(1);
    openStep(1);
    await waitFor(() => expect(optionValues('From of movement 1')).toContain('lone_pair:1'));
    expect(optionValues('From of movement 1')).toEqual(['atom:1', 'lone_pair:1', 'radical:1', 'atom:2', 'lone_pair:2', 'radical:2', 'atom:3', 'lone_pair:3', 'radical:3', 'bond:1-2', 'bond:1-3', 'bond:2-3']);
    expect((screen.getByLabelText('From of movement 1') as HTMLSelectElement).value).toBe('lone_pair:1');
    expect((screen.getByLabelText('To of movement 1') as HTMLSelectElement).value).toBe('bond:1-2');
    change('To of movement 1', 'bond:2-3');
    expect(stepOf(rig, id).electronMovements[0]).toEqual({ from: { kind: 'lone_pair', atom: 1 }, to: { kind: 'bond', atoms: [2, 3] }, electrons: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Add electron movement' }));
    expect(stepOf(rig, id).electronMovements[2]).toEqual({});
    change('From of movement 3', 'radical:2');
    change('Electrons of movement 3', '1');
    expect(stepOf(rig, id).electronMovements[2]).toEqual({ from: { kind: 'radical', atom: 2 }, electrons: 1 });
  });

  it('a value the step maps no longer offer stays selectable and says so (nothing is changed silently)', async () => {
    const { rig, id } = show(SN2);
    act(() => void rig.drafts.edit(id, (draft) => void ((draft as unknown as Mechanism).variants[0]?.steps[0]?.bondsFormed[0] as { atoms: number[] }).atoms.splice(1, 1, 9)));
    openVariant(1);
    openStep(1);
    await waitFor(() => expect(optionValues('Atoms of bond formed 1')).toContain('1-9'));
    expect(within(screen.getByLabelText('Atoms of bond formed 1')).getByRole('option', { name: /Atoms 1 and 9.*not in this step/ })).toBeTruthy();
    expect(stepOf(rig, id).bondsFormed[0]?.atoms).toEqual([1, 9]);
  });

  it('a step with no mapped structure says "Add atom-mapped structures to this step first" and offers no new bond or movement', async () => {
    show(ALDOL);
    openVariant(2);
    openStep(1);
    expect((await screen.findAllByText('Add atom-mapped structures to this step first')).length).toBeGreaterThan(0);
    expect(isOff(screen.getByRole('button', { name: 'Add bond formed' }))).toBe(true);
    expect(isOff(screen.getByRole('button', { name: 'Add electron movement' }))).toBe(true);
  });
});

describe('CHEM-008 and the MEC rules mark their row', () => {
  it('a CHEM-008 finding at a bond row marks that row and its step, and the finding opens the row', async () => {
    const path = 'variants[0].steps[0].bondsBroken[0]';
    const checks: DraftChecksPort = {
      ...quiet,
      structure: async (_k, draft, version) => ({
        version,
        state: 'checked',
        suggestions: [],
        notCompared: [],
        findings: [toFinding('CHEM-008', { kind: 'mechanism', id: (draft as { id: string }).id as never }, { path, message: 'Atom map 9 is not on any atom of the structures of this step.' })],
      }),
    };
    show(SN2, { checks });
    openVariant(1);
    openStep(1);
    await waitFor(() => expect(screen.getByLabelText('Atoms of bond broken 1').getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getByLabelText('Atoms of bond formed 1').getAttribute('aria-invalid')).toBeNull();
    expect(screen.getByTestId('step-summary').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getAllByText(/Atom map 9 is not on any atom/).length).toBeGreaterThan(0);
  });
});

describe('on a phone', () => {
  it('step rows carry the phone flag so they stack', () => {
    show(SN2, { phone: true });
    fireEvent.click(screen.getByRole('button', { name: /Variants/ }));
    openVariant(1);
    expect(document.querySelector('[data-testid="step-row"][data-phone="true"]')).toBeTruthy();
    openStep(1);
    expect(document.querySelector('[data-testid="species-row"][data-phone="true"]')).toBeTruthy();
  });
});
