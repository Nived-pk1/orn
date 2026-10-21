// @vitest-environment jsdom
/**
 * The reaction editor's Identity and Participants (step 6.3a part 3, decisions D1 and D2) over the real store, the real session manager and
 * the real picker port: the role defaults in words, the collapsed override flags, the reagent profile choice only for a reagent with profiles,
 * the stage choice only when there are stages, the exact-permutation reorder, the read-only rest kept by Save.
 */
import { utcTime } from '@/test-support/editing-kit';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRecordPicker } from '@/app/window/record-picker-port';
import { indexEngine } from '@/core/indexes';
import type { CanonicalState, Reaction } from '@/core/schema';
import { PHONE_QUERIES } from '@/ui/hooks';
import { must } from '@/test-support/state-fixture';
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
const BAEYER = 'rxn_ethene-baeyers';
const PCC = 'rxn_ethanol-to-ethanal-pcc';
const GRIGNARD = 'rxn_methylmgbr-ethanal';
const ALDOL = 'rxn_ethanal-aldol';

function pickerFor(rig: EditorRig) {
  const state = () => rig.store.getState();
  return createRecordPicker({
    search: (async (_channel: string, request: { text: string; kinds: readonly string[] }) => ({
      ok: true,
      value: request.kinds.flatMap((kind) =>
        Object.values((state().records as unknown as Record<string, Record<string, { id: string; names?: { canonical: string }; name?: string }>>)[kind] ?? {})
          .filter((r) => (r.names?.canonical ?? r.name ?? '').toLowerCase().includes(request.text.toLowerCase()))
          .map((r) => ({ ref: { kind, id: r.id } })),
      ),
    })) as never,
    state,
    indexes: () => indexEngine.build(state()),
    activeExam: () => null,
  });
}

function show(options: { target?: string; state?: CanonicalState } = {}) {
  const rig = editorRig(options.state === undefined ? {} : { state: options.state });
  const opened = rig.drafts.open({ kind: 'reaction', id: options.target ?? PCC });
  if (!opened.ok) throw new Error(opened.message);
  renderWithToasts(<EditorHost port={{ ...rig.port, checks: quiet, records: pickerFor(rig) }} sessionId={opened.id} open formatTime={utcTime} onClose={vi.fn()} />);
  return { rig, id: opened.id, dialog: screen.getByRole('dialog') };
}
const draftOf = (rig: EditorRig, id: string): Reaction => rig.drafts.entry(id)?.session.draft as Reaction;
const stored = (rig: EditorRig, id = PCC): Reaction => rig.store.getState().records.reaction[id as never] as Reaction;
const row = (n: number): HTMLElement => screen.getAllByTestId('participant-row')[n - 1] as HTMLElement;
const set = (label: string | RegExp, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
/** A collapsed participant row shows its summary line only (step 6.3b D1): "Edit" opens it (and closes the one that was open). */
const expand = (n: number): void => void fireEvent.click(screen.getByRole('button', { name: `Edit participant ${n}` }));
const isOpen = (n: number): boolean => screen.getByRole('button', { name: new RegExp(`^(Edit|Close) participant ${n}$`) }).getAttribute('aria-expanded') === 'true';
const withReaction = (id: string, change: (r: Reaction) => Reaction): CanonicalState => {
  const state = demoState();
  return { ...state, records: { ...state.records, reaction: { ...state.records.reaction, [id]: change(state.records.reaction[id as never] as Reaction) } } } as unknown as CanonicalState;
};

describe('the reaction form', () => {
  it('lists Identity, Participants, Links and reversibility and Review, each with a toggle; the title names the reaction', () => {
    const { dialog } = show();
    const toggles = within(dialog).getAllByRole('button', { expanded: true }).map((b) => b.textContent?.replace(/^[▾▸]\s*/, ''));
    expect(toggles).toContain('Identity');
    expect(toggles).toContain('Participants');
    expect(within(dialog).getByRole('heading', { name: /^Edit / })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: /Links and reversibility/ })).toBeTruthy(); // the 6.6b section replaced the read-only summaries
    expect(within(dialog).queryByText(/Editing arrives in step 6\.6b/)).toBeNull();
  });

  it('Identity: name and aliases (no Names section), purposes; each change is a draft edit', () => {
    const { rig, id } = show();
    set('Name (required)', 'Ethanol with PCC');
    fireEvent.click(screen.getByRole('button', { name: 'Add alias' }));
    const aliases = draftOf(rig, id).aliases.length;
    set(`Alias ${aliases}`, 'PCC oxidation');
    expect(draftOf(rig, id).name).toBe('Ethanol with PCC');
    expect(draftOf(rig, id).aliases.at(-1)).toBe('PCC oxidation');
    expect(screen.queryByLabelText('Canonical name (required)')).toBeNull();
    const absent = ['synthesis', 'degradation', 'protection'].find((p) => !draftOf(rig, id).purposes.includes(p as never)) as string;
    fireEvent.click(screen.getByLabelText(absent.charAt(0).toUpperCase() + absent.slice(1)));
    expect(draftOf(rig, id).purposes).toContain(absent);
  });

  it('Instance of: only a GENERIC reaction can be chosen; a generic reaction cannot take one', async () => {
    const { rig, id, dialog } = show();
    fireEvent.click(within(within(dialog).getByRole('list', { name: 'Instance of' })).getByRole('button', { name: /^Remove / }));
    expect(Object.hasOwn(draftOf(rig, id), 'instanceOfId')).toBe(false);
    fireEvent.change(within(dialog).getByLabelText('Find the generic reaction by name'), { target: { value: 'ethanol' } });
    const found = within(await within(dialog).findByRole('list', { name: 'Generic reactions found' }));
    expect(found.getAllByText(/Only a generic reaction can be the base of a specific one/).length).toBeGreaterThan(0);
    fireEvent.change(within(dialog).getByLabelText('Find the generic reaction by name'), { target: { value: 'alcohol' } });
    fireEvent.click((await within(dialog).findByRole('list', { name: 'Generic reactions found' })).querySelector('button[aria-label^="Add "]') as HTMLElement);
    expect(draftOf(rig, id).instanceOfId).toBe('rxn_alcohol1-to-aldehyde-pcc');
    set('Scope (required)', 'generic');
    expect(screen.getByText(/A generic reaction cannot be an instance of another one \(RXN-013\)/)).toBeTruthy();
  });

  it('Review: the lifecycle is editable, the status is read-only words', () => {
    const { rig, id } = show();
    set('Lifecycle', 'published');
    expect(draftOf(rig, id).review.lifecycle).toBe('published');
    expect(screen.getByText(/Review status:/)).toBeTruthy();
  });

  it('a legacy reagent family kept in the provenance is shown read-only, never linked', () => {
    show({ state: withReaction(PCC, (r) => ({ ...r, provenance: { ...r.provenance, legacy: { system: 'orn-v6', unmapped: { reagentFamily: 'aq. KOH' } } } }) as Reaction) });
    expect(screen.getByText('From the older app: reagent family aq. KOH')).toBeTruthy();
  });
});

describe('the participant rows', () => {
  it("one row per participant, with the role's DEFAULT flags in words", () => {
    const { rig, id } = show({ target: GRIGNARD });
    expect(screen.getAllByTestId('participant-row')).toHaveLength(draftOf(rig, id).participants.length);
    expand(1);
    expect(within(row(1)).getByText('By default a reactant contributes atoms, is consumed and is not catalytic.')).toBeTruthy();
    set('Role of participant 1', 'catalyst');
    expect(draftOf(rig, id).participants[0]?.role).toBe('catalyst');
    expect(within(row(1)).getByText('By default a catalyst contributes no atoms, is not consumed and is catalytic.')).toBeTruthy();
    set('Role of participant 1', 'spectator');
    expect(within(row(1)).getAllByText(/a spectator never contributes atoms/).length).toBeGreaterThan(0);
  });

  it('the override flags are in a collapsed "Advanced" area that shows the default; "Default" removes the override', () => {
    const { rig, id } = show({ target: GRIGNARD });
    expand(1);
    const advanced = within(row(1)).getByText('Advanced: override flags').closest('details') as HTMLDetailsElement;
    expect(advanced.open).toBe(false);
    expect(within(advanced).getByText('Advanced: override flags')).toBeTruthy();
    const flag = within(advanced).getByLabelText('Is consumed: participant 1');
    expect(within(flag).getByRole('option', { name: 'Default (yes)' })).toBeTruthy();
    fireEvent.change(flag, { target: { value: 'no' } });
    expect(draftOf(rig, id).participants[0]?.flags).toEqual({ consumed: false });
    fireEvent.change(flag, { target: { value: 'default' } });
    expect(Object.hasOwn(draftOf(rig, id).participants[0] as object, 'flags')).toBe(false);
  });

  it('coefficient, phase, strength, dry, quantity: set, and an empty value removes the field', () => {
    const { rig, id } = show({ target: GRIGNARD });
    expand(2);
    set('Coefficient of participant 2', '2');
    set('Phase of participant 2', 'l');
    set('Strength of participant 2', 'concentrated');
    fireEvent.click(screen.getByLabelText('Dry: participant 2'));
    set('Equivalents of participant 2', '1.5');
    set('Amount word of participant 2', 'excess');
    set('Amount text of participant 2', 'a little');
    expect(draftOf(rig, id).participants[1]).toMatchObject({ coefficient: 2, phase: 'l', strength: 'concentrated', dry: true, quantity: { equivalents: 1.5, qualifier: 'excess', text: 'a little' } });
    set('Coefficient of participant 2', '');
    set('Phase of participant 2', '');
    expect(Object.hasOwn(draftOf(rig, id).participants[1] as object, 'coefficient')).toBe(false);
    expect(Object.hasOwn(draftOf(rig, id).participants[1] as object, 'phase')).toBe(false);
  });

  it("the profile choice appears ONLY for a reagent that has profiles, and offers that reagent's profiles", () => {
    const { rig, id } = show({ target: BAEYER });
    const withProfiles: number[] = [];
    for (let n = 1; n <= screen.getAllByTestId('participant-row').length; n += 1) {
      expand(n);
      if (within(row(n)).queryByLabelText(/^Profile of participant/) !== null) withProfiles.push(n);
    }
    expect(withProfiles).toHaveLength(1);
    if (!isOpen(withProfiles[0] as number)) expand(withProfiles[0] as number);
    const options = within(within(row(withProfiles[0] as number)).getByLabelText(/^Profile of participant/)).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['No profile', "Baeyer's reagent", 'Hot, concentrated']);
    fireEvent.change(within(row(withProfiles[0] as number)).getByLabelText(/^Profile of participant/), { target: { value: 'rpf_permanganate-hot' } });
    expect(draftOf(rig, id).participants.some((p) => p.profileId === 'rpf_permanganate-hot')).toBe(true);
  });

  it('the stage choice moves the participant between stages, exactly one', () => {
    const { rig, id } = show({ target: GRIGNARD });
    const before = draftOf(rig, id);
    expect(before.stages).toHaveLength(2);
    expand(1);
    const stageSelect = within(row(1)).getByLabelText('Stage of participant 1');
    expect(within(stageSelect).getAllByRole('option')).toHaveLength(2);
    const target = before.stages[0]?.participantIds.includes(must(before.participants[0]).id) ? '1' : '0';
    fireEvent.change(stageSelect, { target: { value: target } });
    const next = draftOf(rig, id);
    expect(next.stages.filter((s) => s.participantIds.includes(must(next.participants[0]).id))).toHaveLength(1);
    expect(next.stages[Number(target)]?.participantIds).toContain(must(next.participants[0]).id);
  });

  it('a reaction with NO stages shows no stage choice', () => {
    show({ target: PCC, state: withReaction(PCC, (r) => ({ ...r, stages: [] }) as Reaction) });
    expect(screen.queryByLabelText(/^Stage of participant/)).toBeNull();
    expect(screen.getByText(/This reaction has no stages, so every participant is common/)).toBeTruthy();
  });

  it('Up and Down reorder as an exact permutation (the same participants, no stage list changed)', () => {
    const { rig, id } = show({ target: GRIGNARD });
    const before = draftOf(rig, id);
    fireEvent.click(screen.getByRole('button', { name: 'Move participant 1 down' }));
    const after = draftOf(rig, id);
    expect(after.participants.map((p) => p.id)).toEqual([must(before.participants[1]).id, must(before.participants[0]).id, ...before.participants.slice(2).map((p) => p.id)]);
    expect(after.stages).toEqual(before.stages);
    expect(screen.getByRole('button', { name: 'Move participant 1 up' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('adds a participant with the chosen role (in stage 1 when there are stages, and it says so) and removes one', async () => {
    const { rig, id, dialog } = show({ target: GRIGNARD });
    const count = draftOf(rig, id).participants.length;
    set('Add it as', 'solvent');
    fireEvent.change(within(dialog).getByLabelText('Find a substance by name'), { target: { value: 'propanone' } });
    fireEvent.click((await within(dialog).findByRole('list', { name: 'Substances found' })).querySelector('button[aria-label^="Add Propanone"]') as HTMLElement);
    const next = draftOf(rig, id);
    expect(next.participants).toHaveLength(count + 1);
    expect(next.participants.at(-1)).toMatchObject({ ref: { kind: 'species', id: 'spc_propanone' }, role: 'solvent' });
    expect(next.stages[0]?.participantIds).toContain(must(next.participants.at(-1)).id);
    expect(within(dialog).getByText(/Propanone was added as solvent in stage 1/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `Remove participant ${count + 1}` }));
    expect(draftOf(rig, id).participants).toHaveLength(count);
    expect(draftOf(rig, id).stages.every((s) => !s.participantIds.includes(must(next.participants.at(-1)).id))).toBe(true);
  });

  it('a participant a condition variant names cannot be removed: the reason is said in words', () => {
    const { rig, id } = show({ target: ALDOL });
    const victim = draftOf(rig, id).conditionVariants.flatMap((v) => v.participantIds)[0];
    const index = draftOf(rig, id).participants.findIndex((p) => p.id === victim);
    const button = screen.getByRole('button', { name: `Remove participant ${index + 1}` });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(within(row(index + 1)).getAllByText(/is used by the condition '.+'; change that in step 6\.4's editor first/).length).toBeGreaterThan(0);
  });

  it('Change substance replaces the substance', async () => {
    const { rig, id, dialog } = show({ target: GRIGNARD });
    expand(3);
    fireEvent.click(screen.getByRole('button', { name: 'Change substance of participant 3' }));
    fireEvent.change(within(dialog).getByLabelText('Find the new substance of participant 3'), { target: { value: 'propanone' } });
    fireEvent.click((await within(dialog).findByRole('list', { name: 'Substances found for participant 3' })).querySelector('button[aria-label^="Add Propanone"]') as HTMLElement);
    expect(draftOf(rig, id).participants[2]?.ref).toEqual({ kind: 'species', id: 'spc_propanone' });
  });

  it('the wording written in the source is read-only text', () => {
    show({ state: withReaction(PCC, (r) => ({ ...r, participants: r.participants.map((p, i) => (i === 0 ? { ...p, originalText: 'alc. KOH' } : p)) }) as Reaction) });
    expand(1);
    expect(within(row(1)).getByText('Written in the source as: alc. KOH')).toBeTruthy();
  });

  it('Save keeps every field the editor does not edit; Undo restores the coefficient', async () => {
    const { rig } = show({ target: GRIGNARD });
    const before = stored(rig, GRIGNARD);
    expand(1);
    set('Coefficient of participant 1', '3');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(stored(rig, GRIGNARD).participants[0]?.coefficient).toBe(3));
    const after = stored(rig, GRIGNARD);
    expect(after.outcomes).toEqual(before.outcomes);
    expect(after.stages).toEqual(before.stages);
    expect(after.conditionVariants).toEqual(before.conditionVariants);
    expect(after.reversibility).toEqual(before.reversibility);
    expect(after.citations).toEqual(before.citations);
    await act(async () => rig.store.undo());
    expect(stored(rig, GRIGNARD).participants[0]?.coefficient).toBe(before.participants[0]?.coefficient);
  });

  it('on a phone each participant is ONE stacked card', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    show({ target: GRIGNARD });
    for (const card of screen.getAllByTestId('participant-row')) expect(card.className).toContain('participantPhone');
    expect(within(row(1)).getAllByRole('button').map((b) => b.textContent).slice(0, 4)).toEqual(['Edit', 'Up', 'Down', 'Remove']);
    expand(1);
    expect(within(row(1)).getByRole('button', { name: 'Change substance of participant 1' })).toBeTruthy();
  });
});

describe('the compact participant rows (step 6.3b D1)', () => {
  it('every row starts as a SUMMARY LINE with Edit, Up, Down and Remove; no field is on the page', () => {
    const { rig, id } = show({ target: GRIGNARD });
    const rows = screen.getAllByTestId('participant-row');
    expect(rows).toHaveLength(draftOf(rig, id).participants.length);
    rows.forEach((card, at) => {
      expect(within(card).getAllByRole('button').map((b) => b.textContent)).toEqual(['Edit', 'Up', 'Down', 'Remove']);
      expect(within(card).getByRole('button', { name: `Edit participant ${at + 1}` }).getAttribute('aria-expanded')).toBe('false');
      expect(within(card).getByText(new RegExp(`^${at + 1}\\. .+`))).toBeTruthy();
    });
    expect(screen.queryByLabelText(/^Role of participant/)).toBeNull();
    expect(screen.queryByLabelText(/^Coefficient of participant/)).toBeNull();
  });

  it('the summary line states what is stated: the coefficient, phase and strength appear when set and never as "Not stated"', () => {
    const { rig, id } = show({ target: GRIGNARD });
    expect(within(row(2)).queryByText(/Not stated/)).toBeNull();
    expand(2);
    set('Coefficient of participant 2', '2');
    set('Phase of participant 2', 'l');
    set('Strength of participant 2', 'concentrated');
    fireEvent.click(screen.getByRole('button', { name: 'Close participant 2' }));
    expect(draftOf(rig, id).participants[1]).toMatchObject({ coefficient: 2, phase: 'l', strength: 'concentrated' });
    // each part of the line is its own element now (so a part never breaks inside), the text is the same
    expect(row(2).textContent).toMatch(/· ×2 · l · Concentrated/);
    expect(within(row(2)).queryByText(/Not stated/)).toBeNull();
  });

  it('at most ONE row is expanded: Edit on another row closes the first, and the fields of a closed row are gone', () => {
    show({ target: GRIGNARD });
    expand(1);
    expect(isOpen(1)).toBe(true);
    expect(within(row(1)).getByLabelText('Role of participant 1')).toBeTruthy();
    expand(2);
    expect(isOpen(2)).toBe(true);
    expect(isOpen(1)).toBe(false);
    expect(screen.queryByLabelText('Role of participant 1')).toBeNull();
    expect(screen.getAllByLabelText(/^Role of participant/)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close participant 2' }));
    expect(screen.queryByLabelText(/^Role of participant/)).toBeNull();
  });

  it('an expanded row has substance, role (with its defaults in words), coefficient, phase, strength and stage; "More details" and "Advanced" are collapsed', () => {
    show({ target: GRIGNARD });
    expand(1);
    const open = within(row(1));
    expect(open.getByRole('button', { name: 'Change substance of participant 1' })).toBeTruthy();
    for (const label of ['Role', 'Coefficient', 'Phase', 'Strength', 'Stage']) expect(open.getByLabelText(`${label} of participant 1`)).toBeTruthy();
    expect(open.getByText(/^By default a reactant/)).toBeTruthy();
    const more = open.getByText('More details').closest('details') as HTMLDetailsElement;
    const advanced = open.getByText('Advanced: override flags').closest('details') as HTMLDetailsElement;
    expect(more.open).toBe(false);
    expect(advanced.open).toBe(false);
    for (const label of ['Dry', 'Main substrate', 'Equivalents', 'Amount word', 'Amount text']) expect(more.querySelector(`[aria-label^="${label}"]`)).not.toBeNull();
    expect(advanced.querySelector('[aria-label^="Is consumed"]')).not.toBeNull();
  });

  it('the stage choice is full width: it sits in its own full-row field, so its label is not cut', () => {
    show({ target: GRIGNARD });
    expand(1);
    const field = within(row(1)).getByLabelText('Stage of participant 1').closest('div') as HTMLElement;
    expect(field.className).toContain('participantWide');
  });

  it('a participant that is added opens expanded, and the one that was open closes', async () => {
    const { dialog } = show({ target: GRIGNARD });
    expand(1);
    fireEvent.change(within(dialog).getByLabelText('Find a substance by name'), { target: { value: 'propanone' } });
    fireEvent.click((await within(dialog).findByRole('list', { name: 'Substances found' })).querySelector('button[aria-label^="Add Propanone"]') as HTMLElement);
    const count = screen.getAllByTestId('participant-row').length;
    expect(isOpen(count)).toBe(true);
    expect(isOpen(1)).toBe(false);
    expect(within(row(count)).getByLabelText(`Role of participant ${count}`)).toBeTruthy();
  });

  it('a row with a finding shows a marker on its summary line; the marker and the finding in the panel both open the row', async () => {
    const { rig } = show({ target: GRIGNARD });
    expand(1);
    set('Coefficient of participant 1', '-1');
    await act(async () => void rig.ui.fireAfter(300)); // the live schema check runs 300 ms after the last edit
    fireEvent.click(screen.getByRole('button', { name: 'Close participant 1' }));
    expect(screen.queryByLabelText('Coefficient of participant 1')).toBeNull();
    const marker = within(row(1)).getByRole('button', { name: 'Participant 1 has a finding: open it' });
    expect(within(row(2)).queryByRole('button', { name: /has a finding/ })).toBeNull();
    fireEvent.click(marker);
    expect(isOpen(1)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close participant 1' }));
    // the finding in the panel opens the row and puts the focus on the field
    const finding = within(screen.getByRole('region', { name: 'Findings' })).getAllByRole('button')[0] as HTMLElement;
    fireEvent.click(finding);
    expect(isOpen(1)).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Coefficient of participant 1')));
  });
});
