// @vitest-environment jsdom
/**
 * The Outcomes section of the reaction editor (step 6.4b D1-D3) over the real store, session manager and record picker, on the demo's
 * 2-bromobutane E2 reaction (a major and a minor outcome under all conditions), its ethanol + conc. H2SO4 reaction (two variants), the
 * propene + HBr reaction (an isomer group) and its generic alcohol oxidation: summary lines in the card's groups, one outcome open at a
 * time, "Holds under", a new outcome ("unspecified", never guessed), products (add through the picker limited by the scope, the role as
 * radio buttons with no default, reorder, remove), isomer group choose-or-type, the markers of RXN-003 / RXN-008 / RXN-009 on the right
 * outcome, the variant-removal words, and the phone's stacked rows.
 */
import { utcTime } from '@/test-support/editing-kit';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRecordPicker } from '@/app/window/record-picker-port';
import { indexEngine } from '@/core/indexes';
import type { Reaction } from '@/core/schema';
import type { Finding } from '@/core/validation';
import { PHONE_QUERIES } from '@/ui/hooks';
import { editorRig, renderWithToasts, type EditorRig } from '@/test-support/editor-kit';
import { stubDialog } from '@/test-support/window-kit';
import type { DraftChecksPort } from './check-contracts';
import { EditorHost } from './editor-host';

beforeAll(stubDialog);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const E2 = 'rxn_r-2-bromobutane-alc-koh';
const ETHANOL = 'rxn_ethanol-conc-h2so4';
const HBR = 'rxn_propene-hbr';
const GENERIC = 'rxn_alcohol1-to-aldehyde-pcc';
const quiet: DraftChecksPort = {
  dryRun: async (_k, _d, version) => ({
    version,
    state: 'checked',
    findings: [],
  }),
  structure: async (_k, _d, version) => ({ version, state: 'none' }),
};
const finding = (ruleId: string, path: string, severity: 'error' | 'warning', id: string): Finding =>
  ({
    id: `fnd_${ruleId}`,
    ruleId,
    level: 'L3' as never,
    severity,
    subject: { kind: 'reaction', id: id as never },
    path,
    message: `${ruleId} at ${path}`,
    related: [],
  }) as Finding;

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
function show(target: string, checks: DraftChecksPort = quiet) {
  const rig = editorRig();
  const opened = rig.drafts.open({ kind: 'reaction', id: target });
  if (!opened.ok) throw new Error(opened.message);
  renderWithToasts(<EditorHost port={{ ...rig.port, checks, records: pickerFor(rig) }} sessionId={opened.id} open formatTime={utcTime} onClose={vi.fn()} />);
  return { rig, id: opened.id };
}
const draftOf = (rig: EditorRig, id: string): Reaction => rig.drafts.entry(id)?.session.draft as Reaction;
const summaries = (): string[] => screen.getAllByTestId('outcome-summary').map((e) => e.textContent ?? '');
const summaryEl = (n: number): HTMLElement => screen.getAllByTestId('outcome-summary')[n - 1] as HTMLElement;
const editOutcome = (n: number) => fireEvent.click(screen.getByRole('button', { name: `Edit outcome ${n}` }));
const outcomeRow = (n: number): HTMLElement => screen.getByRole('group', { name: `Outcome ${n}` });
const addProductNamed = async (outcome: number, text: string) => {
  fireEvent.change(screen.getByLabelText(`Find a product of outcome ${outcome} by name`), { target: { value: text } });
  const list = await screen.findByRole('list', {
    name: `Products found for outcome ${outcome}`,
  });
  fireEvent.click(await waitFor(() => list.querySelector('button[aria-label^="Add "]') as HTMLElement));
};

describe('the summary lines and the groups', () => {
  it("each outcome is ONE line in the card's groups, unstated parts left out; no field is on the page", () => {
    show(E2);
    const lines = summaries();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^1\. major · .+ · Saytzeff · under all conditions$/);
    expect(lines[1]).toMatch(/^2\. minor · .+ · Hofmann · under all conditions$/);
    expect(screen.getAllByTestId('outcome-group')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'All conditions' })).toBeTruthy();
    expect(screen.queryByLabelText('Selectivity of outcome 1')).toBeNull();
  });

  it('outcomes under different variants are in separate groups headed by the variant labels', () => {
    show(ETHANOL);
    expect(screen.getAllByTestId('outcome-group')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Under 413 K, excess ethanol' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Under 443 K, excess acid' })).toBeTruthy();
    expect(summaries()[0]).toMatch(/under 413 K, excess ethanol$/);
  });

  it('Edit opens one outcome at a time; Close closes it', () => {
    show(E2);
    editOutcome(1);
    expect(screen.getByLabelText('Selectivity of outcome 1')).toBeTruthy();
    editOutcome(2);
    expect(screen.queryByLabelText('Selectivity of outcome 1')).toBeNull();
    expect(screen.getByLabelText('Selectivity of outcome 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close outcome 2' }));
    expect(screen.queryByLabelText('Selectivity of outcome 2')).toBeNull();
  });
});

describe('Up, Down and Remove', () => {
  it('Up and Down move the outcome in the stored order; the ends say why they cannot', () => {
    const { rig, id } = show(E2);
    const first = draftOf(rig, id).outcomes[0]?.id;
    fireEvent.click(screen.getByRole('button', { name: 'Move outcome 1 down' }));
    expect(draftOf(rig, id).outcomes[1]?.id).toBe(first);
    expect(
      screen.getByRole('button', { name: 'Move outcome 1 up' }).hasAttribute('aria-disabled') ||
        (
          screen.getByRole('button', {
            name: 'Move outcome 1 up',
          }) as HTMLButtonElement
        ).disabled,
    ).toBe(true);
  });

  it('Remove asks first; Cancel changes nothing; confirming removes the outcome', () => {
    const { rig, id } = show(E2);
    fireEvent.click(screen.getByRole('button', { name: 'Remove outcome 2' }));
    const ask = screen.getByRole('group', { name: 'Remove outcome 2?' });
    fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(draftOf(rig, id).outcomes).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Remove outcome 2' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Remove outcome 2?' })).getByRole('button', { name: 'Remove the outcome' }));
    expect(draftOf(rig, id).outcomes).toHaveLength(1);
  });
});

describe('Holds under', () => {
  it('"All conditions" is the default; choosing variants names them (the order of the reaction); All conditions empties the list', () => {
    const { rig, id } = show(ETHANOL);
    editOutcome(1);
    const holds = screen.getByRole('group', { name: 'Holds under, outcome 1' });
    expect((within(holds).getByLabelText('All conditions: outcome 1') as HTMLInputElement).checked).toBe(false);
    fireEvent.click(within(holds).getByLabelText('443 K, excess acid: outcome 1'));
    expect(draftOf(rig, id).outcomes[0]?.conditionVariantIds).toEqual(['cvr_ethanol-conc-h2so4-1', 'cvr_ethanol-conc-h2so4-2']);
    fireEvent.click(within(holds).getByLabelText('All conditions: outcome 1'));
    expect(draftOf(rig, id).outcomes[0]?.conditionVariantIds).toEqual([]);
    expect((within(holds).getByLabelText('All conditions: outcome 1') as HTMLInputElement).checked).toBe(true);
  });

  it('a variant an outcome no longer names can be removed after "Holds under" is changed in the same editor', () => {
    const { rig, id } = show(ETHANOL);
    expect(screen.getAllByText(/change the outcome's 'Holds under' first\./).length).toBeGreaterThan(0);
    editOutcome(1);
    const holds = screen.getByRole('group', { name: 'Holds under, outcome 1' });
    fireEvent.click(within(holds).getByLabelText('443 K, excess acid: outcome 1'));
    fireEvent.click(within(holds).getByLabelText('413 K, excess ethanol: outcome 1'));
    expect(draftOf(rig, id).outcomes[0]?.conditionVariantIds).toEqual(['cvr_ethanol-conc-h2so4-2']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove variant 1' }));
    expect(screen.getByRole('group', { name: 'Remove variant 1?' })).toBeTruthy();
  });
});

describe('a new outcome', () => {
  it('starts "unspecified" under all conditions with no product; it opens; RXN-003 is said in words', () => {
    const { rig, id } = show(E2);
    fireEvent.click(screen.getByRole('button', { name: 'Add outcome' }));
    const added = draftOf(rig, id).outcomes[2];
    expect(added).toMatchObject({
      selectivity: 'unspecified',
      conditionVariantIds: [],
      products: [],
    });
    expect((screen.getByLabelText('Selectivity of outcome 3') as HTMLSelectElement).value).toBe('unspecified');
    expect(screen.getByText(/No products yet: an outcome needs at least one \(RXN-003\)\./)).toBeTruthy();
    expect(summaries()[2]).toBe('3. under all conditions');
  });

  it('selectivity, regiochemistry, isomer group and rationale are edited as typed; empty removes the field', () => {
    const { rig, id } = show(E2);
    editOutcome(2);
    fireEvent.change(screen.getByLabelText('Selectivity of outcome 2'), {
      target: { value: 'trace' },
    });
    fireEvent.change(screen.getByLabelText('Regiochemistry of outcome 2'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText('Rationale of outcome 2'), {
      target: { value: 'less substituted alkene' },
    });
    const o = draftOf(rig, id).outcomes[1];
    expect(o?.selectivity).toBe('trace');
    expect(Object.hasOwn(o as object, 'regiochemistry')).toBe(false);
    expect(o?.rationale).toBe('less substituted alkene');
    expect(summaries()[1]).toMatch(/^2\. trace · .+ · under all conditions$/);
  });

  it('the mechanism link is a picker since step 6.5a (its choices are tested in reaction-mechanism-links.test.tsx)', () => {
    show(E2);
    editOutcome(1);
    expect((screen.getByLabelText('Mechanism of outcome 1') as HTMLSelectElement).value).toBe('mec_e2-haloalkane');
    expect(screen.queryByText(/Editing arrives in step 6\.5\./)).toBeNull();
  });
});

describe('isomer group and stereochemistry', () => {
  it('choose a group already used in this reaction, or type a new one', () => {
    const { rig, id } = show(HBR);
    editOutcome(1);
    const used = draftOf(rig, id).outcomes[0]?.isomerGroup as string;
    expect(used).not.toBe('');
    fireEvent.change(screen.getByLabelText('Isomer group of outcome 1'), {
      target: { value: '' },
    });
    expect(Object.hasOwn(draftOf(rig, id).outcomes[0] as object, 'isomerGroup')).toBe(false);
    fireEvent.change(screen.getByLabelText('Use a named isomer group for outcome 1'), { target: { value: used } });
    expect(draftOf(rig, id).outcomes[0]?.isomerGroup).toBe(used);
    fireEvent.change(screen.getByLabelText('Isomer group of outcome 1'), {
      target: { value: 'Another group' },
    });
    expect(draftOf(rig, id).outcomes[0]?.isomerGroup).toBe('Another group');
  });

  it('stereochemistry: the outcome starts the field, descriptors add and remove, Remove asks when something would go with it', () => {
    const { rig, id } = show(E2);
    editOutcome(1);
    fireEvent.change(screen.getByLabelText('Stereochemical outcome of outcome 1'), { target: { value: 'anti_addition' } });
    expect(draftOf(rig, id).outcomes[0]?.stereochemistry).toEqual({
      outcome: 'anti_addition',
      descriptors: [],
    });
    fireEvent.change(screen.getByLabelText('Add a descriptor (for example Z)'), { target: { value: 'E' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add descriptor to outcome 1' }));
    expect(draftOf(rig, id).outcomes[0]?.stereochemistry?.descriptors).toEqual(['E']);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove stereochemistry of outcome 1',
      }),
    );
    expect(draftOf(rig, id).outcomes[0]?.stereochemistry).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Remove the stereochemistry' }));
    expect(draftOf(rig, id).outcomes[0]?.stereochemistry).toBeUndefined();
  });
});

describe('products', () => {
  it('a specific reaction offers species; the new product has NO role until one of the three buttons is chosen', async () => {
    const { rig, id } = show(E2);
    fireEvent.click(screen.getByRole('button', { name: 'Add outcome' }));
    expect(screen.getByText('A specific reaction names species as products.')).toBeTruthy();
    await addProductNamed(3, 'ethanol');
    const added = draftOf(rig, id).outcomes[2]?.products[0];
    expect(added?.ref.kind).toBe('species');
    expect(added && 'role' in added).toBe(false);
    const group = screen.getByRole('group', {
      name: 'Role of product 1 of outcome 3',
    });
    expect(within(group).getByText('Choose a role')).toBeTruthy();
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => (r as HTMLInputElement).checked),
    ).toEqual([false, false, false]);
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => r.parentElement?.textContent),
    ).toEqual(['Main', 'Coproduct', 'Byproduct']);
    fireEvent.click(within(group).getByRole('radio', { name: 'Coproduct' }));
    expect(draftOf(rig, id).outcomes[2]?.products[0]?.role).toBe('coproduct');
    fireEvent.click(within(group).getByRole('radio', { name: 'Main' }));
    expect(draftOf(rig, id).outcomes[2]?.products[0]?.role).toBe('main');
    expect(summaries()[2]).toMatch(/^3\. Ethanol · under all conditions$/);
  });

  it('a specific reaction does not find classes; a generic one finds classes and no species', async () => {
    show(E2);
    editOutcome(1);
    fireEvent.change(screen.getByLabelText('Find a product of outcome 1 by name'), { target: { value: 'alkenes' } });
    await waitFor(() => expect(screen.getByText(/0 substances found|No substance|No matches/i)).toBeTruthy());
    cleanup();
    show(GENERIC);
    editOutcome(1);
    expect(screen.getByText('A generic reaction names compound classes as products.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Find a product of outcome 1 by name'), { target: { value: 'aldehydes' } });
    const list = await screen.findByRole('list', {
      name: 'Products found for outcome 1',
    });
    await waitFor(() => expect(list.querySelectorAll('li').length).toBeGreaterThan(0));
  });

  it('products reorder and are removed; the other product fields are in "More details"', () => {
    const { rig, id } = show(E2);
    editOutcome(1);
    const first = draftOf(rig, id).outcomes[0]?.products[0]?.id;
    expect(screen.getAllByTestId('product-row')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Coefficient of product 1 of outcome 1'), { target: { value: '2' } });
    expect(draftOf(rig, id).outcomes[0]?.products[0]?.coefficient).toBe(2);
    fireEvent.change(screen.getByLabelText('Phase of product 1 of outcome 1'), {
      target: { value: 'g' },
    });
    expect(draftOf(rig, id).outcomes[0]?.products[0]?.phase).toBe('g');
    fireEvent.click(screen.getByRole('button', { name: 'Remove product 1 of outcome 1' }));
    expect(draftOf(rig, id).outcomes[0]?.products).toHaveLength(0);
    expect(first).toBeTruthy();
  });
});

describe('findings mark the outcome they name', () => {
  const checks = (id: string): DraftChecksPort => ({
    dryRun: async (_k, _d, version) => ({
      version,
      state: 'checked',
      findings: [finding('RXN-003', 'outcomes[1].products', 'warning', id), finding('RXN-008', 'outcomes[0].selectivity', 'error', id), finding('RXN-009', 'outcomes[1].selectivity', 'warning', id)],
    }),
    structure: async (_k, _d, version) => ({ version, state: 'none' }),
  });

  it('RXN-008 marks outcome 1, RXN-003 and RXN-009 mark outcome 2, and "Finding" opens the row', async () => {
    show(E2, checks(E2));
    await waitFor(() => expect(summaryEl(1).getAttribute('aria-invalid')).toBe('true'));
    expect(summaryEl(2).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('button', { name: 'Outcome 1 has a finding: open it' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Outcome 2 has a finding: open it' }));
    expect(screen.getByLabelText('Selectivity of outcome 2')).toBeTruthy();
    expect((screen.getByLabelText('Selectivity of outcome 2') as HTMLSelectElement).getAttribute('aria-invalid')).toBe('true');
  });

  it('with no finding the lines are not marked', async () => {
    show(E2);
    await waitFor(() => expect(summaries()).toHaveLength(2));
    expect(summaryEl(1).getAttribute('aria-invalid')).toBeNull();
    expect(screen.queryByRole('button', { name: /has a finding: open it/ })).toBeNull();
  });
});

describe('on a phone', () => {
  it('the outcome rows and the product rows are stacked', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === PHONE_QUERIES[0],
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    show(E2);
    fireEvent.click(screen.getByRole('button', { name: /^.?\s*Outcomes/ })); // a phone starts with this section closed
    editOutcome(1);
    expect(screen.getAllByTestId('outcome-row')[0]?.className).toContain('participantPhone');
    expect(screen.getByTestId('product-row').className).toContain('productPhone');
    expect(outcomeRow(1)).toBeTruthy();
  });
});
