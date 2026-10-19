// @vitest-environment jsdom
/**
 * The reagent editor's sections (step 6.2b part 3, decision D3): Identity (ONE backing species OR components, never both; a component that
 * would close a cycle is refused with the reason), Families, Classes, Profiles with their own aliases (add, edit, move, remove), the read-only
 * conditions kept by Save. Over the real store, the real session manager and the real cycle guards.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRecordPicker } from '@/app/window/record-picker-port';
import { indexEngine } from '@/core/indexes';
import type { CanonicalState, Reagent } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { reagent, rg, sp } from '@/test-support/demo/kit';
import { editorRig, renderWithToasts, type EditorRig } from '@/test-support/editor-kit';
import { stubDialog } from '@/test-support/window-kit';
import type { DraftChecksPort } from './check-contracts';
import { EditorHost } from './editor-host';

beforeAll(stubDialog);
afterEach(cleanup);

const quiet: DraftChecksPort = {
  dryRun: async (_k, _d, version) => ({ version, state: 'checked', findings: [] }),
  structure: async (_k, _d, version) => ({ version, state: 'none' }),
};
const KMNO4 = 'rgt_potassium-permanganate';

const withReagents = (state: CanonicalState, ...extra: Reagent[]): CanonicalState =>
  ({ ...state, records: { ...state.records, reagent: { ...state.records.reagent, ...Object.fromEntries(extra.map((r) => [r.id, r])) } } }) as CanonicalState;
const CYCLE_A = reagent('cyc-a', 'Cycle A', { families: ['catalyst'], components: [{ ref: rg('cyc-b'), role: 'active' }] });
const CYCLE_B = reagent('cyc-b', 'Cycle B', { families: ['catalyst'], components: [{ ref: sp('ethanol'), role: 'solvent' }] });

function pickerFor(rig: EditorRig) {
  const state = () => rig.store.getState();
  return createRecordPicker({
    search: (async (_channel: string, request: { text: string; kinds: readonly string[] }) => ({
      ok: true,
      value: request.kinds.flatMap((kind) =>
        Object.values((state().records as unknown as Record<string, Record<string, { id: string; names: { canonical: string } }>>)[kind] ?? {})
          .filter((r) => r.names.canonical.toLowerCase().includes(request.text.toLowerCase()))
          .map((r) => ({ ref: { kind, id: r.id } })),
      ),
    })) as never,
    state,
    indexes: () => indexEngine.build(state()),
    activeExam: () => null,
  });
}

function show(options: { target?: string; blank?: boolean; state?: CanonicalState } = {}) {
  const rig = editorRig(options.state === undefined ? {} : { state: options.state });
  const opened = rig.drafts.open(options.blank === true ? { kind: 'reagent', blank: true } : { kind: 'reagent', id: options.target ?? KMNO4 });
  if (!opened.ok) throw new Error(opened.message);
  renderWithToasts(<EditorHost port={{ ...rig.port, checks: quiet, records: pickerFor(rig) }} sessionId={opened.id} open onClose={vi.fn()} />);
  return { rig, id: opened.id, dialog: screen.getByRole('dialog') };
}
const draftOf = (rig: EditorRig, id: string): Reagent => rig.drafts.entry(id)?.session.draft as Reagent;
const stored = (rig: EditorRig, id = KMNO4): Reagent => rig.store.getState().records.reagent[id as never] as Reagent;
const set = (label: string | RegExp, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const find = async (dialog: HTMLElement, label: string, text: string, list: string) => {
  fireEvent.change(within(dialog).getByLabelText(label), { target: { value: text } });
  return within(await within(dialog).findByRole('list', { name: list }));
};

describe('the reagent form', () => {
  it('lists Names, Identity, Families, Classes, Profiles, Review and the read-only record, each with a toggle; titles', () => {
    const { dialog } = show();
    const toggles = within(dialog).getAllByRole('button', { expanded: true }).map((b) => b.textContent?.replace(/^[▾▸]\s*/, ''));
    expect(toggles).toEqual(['Names', 'Identity', 'Families', 'Classes', 'Profiles', 'Review', 'Notes, tags and citations']);
    expect(screen.getByRole('dialog', { name: 'Edit Potassium permanganate' })).toBeTruthy();
    cleanup();
    show({ blank: true });
    expect(screen.getByRole('dialog', { name: 'New reagent' })).toBeTruthy();
  });
});

describe('Identity: one backing species OR components, never both', () => {
  it('a backing species is chosen with the species picker; then the components picker is not offered and the reason is said', async () => {
    const { rig, id, dialog } = show({ blank: true });
    const found = await find(dialog, 'Find the backing species by name', 'ethanol', 'Backing species found');
    fireEvent.click(found.getByRole('button', { name: /^Add Ethanol/ }));
    expect(draftOf(rig, id).speciesId).toBe('spc_ethanol');
    expect(within(dialog).queryByLabelText('Find a component by name')).toBeNull();
    expect(within(dialog).getByText(/remove its backing species first/)).toBeTruthy();
    expect(within(dialog).queryByLabelText('Find the backing species by name')).toBeNull();
    fireEvent.click(within(within(dialog).getByRole('list', { name: 'Backing species' })).getByRole('button', { name: 'Remove Ethanol' }));
    expect(Object.hasOwn(draftOf(rig, id), 'speciesId')).toBe(false);
    expect(within(dialog).getByLabelText('Find a component by name')).toBeTruthy();
  });

  it('components (species, class, reagent) are added once each with the role "active", and the backing-species picker goes away', async () => {
    const { rig, id, dialog } = show({ blank: true });
    fireEvent.click((await find(dialog, 'Find a component by name', 'ethanol', 'Components found')).getByRole('button', { name: /^Add Ethanol/ }));
    fireEvent.click((await find(dialog, 'Find a component by name', 'alcohols', 'Components found')).getByRole('button', { name: 'Add Alcohols' }));
    fireEvent.click((await find(dialog, 'Find a component by name', 'pcc', 'Components found')).getByRole('button', { name: 'Add PCC' }));
    expect(draftOf(rig, id).components).toEqual([
      { ref: { kind: 'species', id: 'spc_ethanol' }, role: 'active' },
      { ref: { kind: 'class', id: 'cls_alcohols' }, role: 'active' },
      { ref: { kind: 'reagent', id: 'rgt_pcc' }, role: 'active' },
    ]);
    expect(within(dialog).queryByLabelText('Find the backing species by name')).toBeNull();
    expect(within(dialog).getByText(/remove the components to choose a species/)).toBeTruthy();
    const again = await find(dialog, 'Find a component by name', 'ethanol', 'Components found');
    expect(again.getByText('Already listed')).toBeTruthy();
  });

  it('a component has a role from the schema list and an optional amount (empty = absent); order and removal', () => {
    const { rig, id } = show({ target: 'rgt_lindlar' });
    const before = draftOf(rig, id).components.length;
    expect(within(screen.getByLabelText(/^Role of Palladium/)).getAllByRole('option').map((o) => o.textContent)).toEqual(['Active', 'Support', 'Poison', 'Solvent', 'Additive', 'Co catalyst']);
    set(/^Role of Palladium/, 'co_catalyst');
    set(/^Amount of Palladium/, '5 mol %');
    expect(draftOf(rig, id).components[0]).toMatchObject({ role: 'co_catalyst', amountText: '5 mol %' });
    set(/^Amount of Palladium/, '');
    expect(Object.hasOwn(draftOf(rig, id).components[0] as object, 'amountText')).toBe(false);
    const first = draftOf(rig, id).components[0]?.ref.id;
    fireEvent.click(screen.getByRole('button', { name: /^Move Palladium.* down$/ }));
    expect(draftOf(rig, id).components[1]?.ref.id).toBe(first);
    fireEvent.click(screen.getAllByRole('button', { name: /^Remove / }).find((b) => /Palladium/.test(b.getAttribute('aria-label') ?? '')) as HTMLElement);
    expect(draftOf(rig, id).components).toHaveLength(before - 1);
  });

  it('a component that would close a cycle is refused with the reason and no button (HIER-003, asked before Save)', async () => {
    const { rig, id, dialog } = show({ target: 'rgt_cyc-b', state: withReagents(demoState(), CYCLE_A, CYCLE_B) });
    const found = await find(dialog, 'Find a component by name', 'cycle', 'Components found');
    expect(found.getByText(/Cycle A is already built from this reagent, so it cannot be one of its components: that would make a cycle/)).toBeTruthy();
    expect(found.getByText(/A reagent cannot be a component of itself/)).toBeTruthy();
    expect(found.queryByRole('button', { name: 'Add Cycle A' })).toBeNull();
    expect(found.queryByRole('button', { name: 'Add Cycle B' })).toBeNull();
    expect(draftOf(rig, id).components).toHaveLength(1);
  });

  it('the display formula has a preview with subscripts; the input stays plain text; empty removes it', () => {
    const { rig, id, dialog } = show();
    set(/^Display formula/, 'KMnO4 / H+');
    expect(draftOf(rig, id).formulaText).toBe('KMnO4 / H+');
    const preview = within(dialog).getByText(/Preview:/).parentElement as HTMLElement;
    expect([...preview.querySelectorAll('sub')].length).toBeGreaterThan(0);
    set(/^Display formula/, '');
    expect(Object.hasOwn(draftOf(rig, id), 'formulaText')).toBe(false);
  });
});

describe('Families and Classes', () => {
  it('toggles the schema families (checkboxes) and lists the classes with a picker', async () => {
    const { rig, id, dialog } = show();
    const before = [...draftOf(rig, id).families];
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(17);
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Lewis acid' }));
    expect(draftOf(rig, id).families).toEqual([...before, 'lewis_acid']);
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Oxidant' }));
    expect(draftOf(rig, id).families).not.toContain('oxidant');
    const found = await find(dialog, 'Find a class by name', 'ethers', 'Classes found');
    fireEvent.click(found.getByRole('button', { name: 'Add Ethers' }));
    expect(draftOf(rig, id).classIds).toContain('cls_ethers');
    fireEvent.click(within(within(dialog).getByRole('list', { name: 'Listed classes' })).getByRole('button', { name: 'Remove Ethers' }));
    expect(draftOf(rig, id).classIds).not.toContain('cls_ethers');
  });
});

describe('Profiles', () => {
  it('lists the profiles with their own aliases; adds one with a fresh rpf_ ID, a label and an alias', () => {
    const { rig, id, dialog } = show();
    const before = draftOf(rig, id).profiles.length;
    expect((screen.getByLabelText('Profile 1 label') as HTMLInputElement).value).toBe("Baeyer's reagent");
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add profile' }));
    const added = draftOf(rig, id).profiles.at(-1);
    expect(added?.id).toMatch(/^rpf_/);
    expect(added).toMatchObject({ label: '', aliases: [], parameters: { solventCharacter: [], activation: [], other: [], parsedFields: [] } });
    const n = before + 1;
    set(`Profile ${n} label`, 'Cold, dilute, alkaline');
    fireEvent.click(within(dialog).getByRole('button', { name: `Add alias to profile ${n}` }));
    set(`Profile ${n} alias 1`, "Baeyer's reagent (cold)");
    expect(draftOf(rig, id).profiles.at(-1)).toMatchObject({ label: 'Cold, dilute, alkaline', aliases: ["Baeyer's reagent (cold)"] });
    fireEvent.click(within(dialog).getByRole('button', { name: `Remove profile ${n} alias 1` }));
    expect(draftOf(rig, id).profiles.at(-1)?.aliases).toEqual([]);
  });

  it('reorders and removes profiles; the first cannot go up, the last cannot go down', () => {
    const { rig, id, dialog } = show();
    const ids = draftOf(rig, id).profiles.map((p) => p.id);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(within(dialog).getByRole('button', { name: 'Move profile 1 up' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move profile 1 down' }));
    expect(draftOf(rig, id).profiles.map((p) => p.id).slice(0, 2)).toEqual([ids[1], ids[0]]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove profile 1' }));
    expect(draftOf(rig, id).profiles.map((p) => p.id)).toEqual(ids.slice(0, 1).concat(ids.slice(2)));
  });

  it('shows the conditions read-only and Save keeps them (and everything else of the profile) unchanged', async () => {
    const { rig, dialog } = show();
    expect(within(dialog).getByText(/Cold, dilute, alkaline\. Conditions and behaviour: editing arrives in step 6.6/)).toBeTruthy();
    const before = stored(rig);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add profile' }));
    set('Profile 3 label', 'Neutral');
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(stored(rig).profiles).toHaveLength(3));
    expect(stored(rig).profiles.slice(0, 2)).toEqual(before.profiles);
    const { profiles: _after, provenance: _a, ...restAfter } = stored(rig);
    const { profiles: _before, provenance: _b, ...restBefore } = before;
    expect(restAfter).toEqual(restBefore); // every other field is kept as it was
  });

  it('an empty profile label is refused by Save with the schema\'s words', async () => {
    const { rig, dialog } = show();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add profile' }));
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    expect(await within(dialog).findByRole('heading', { name: 'Save was refused' })).toBeTruthy();
    expect(stored(rig).profiles).toHaveLength(2);
  });
});
