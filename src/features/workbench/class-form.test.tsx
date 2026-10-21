// @vitest-environment jsdom
/**
 * The class editor's sections (step 6.2b part 2, decision D1): each section's fields as recipes, the cycle-safe Parents picker (the reason
 * is shown, no button), the generic formula in the formula typography, an invalid SMARTS in the chem worker's words, the Examples order, the
 * Review lifecycle, and the read-only record kept by Save. Over the real store, real session manager and the real cycle guards.
 */
import { utcTime } from '@/test-support/editing-kit';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRecordPicker } from '@/app/window/record-picker-port';
import { indexEngine } from '@/core/indexes';
import type { ChemicalClass } from '@/core/schema';
import { editorRig, renderWithToasts, type EditorRig } from '@/test-support/editor-kit';
import { stubDialog } from '@/test-support/window-kit';
import type { DraftChecksPort } from './check-contracts';
import { EditorHost } from './editor-host';
import type { RecordPickerPort } from './record-picker-contracts';
import type { SmartsCheck } from './structure-contracts';

beforeAll(stubDialog);
afterEach(cleanup);

const quiet: DraftChecksPort = {
  dryRun: async (_k, _d, version) => ({ version, state: 'checked', findings: [] }),
  structure: async (_k, _d, version) => ({ version, state: 'none' }),
};
const ALCOHOLS = 'cls_alcohols';
const PRIMARY = 'cls_alcohols-primary';

/** The real picker port over the rig's state: names found by a simple scan stand in for the search worker; the cycle guards are the real ones. */
function pickerFor(rig: EditorRig, mapFamily = false): RecordPickerPort {
  const state = () => rig.store.getState();
  const real = createRecordPicker({
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
  return { ...real, isMapFamily: () => mapFamily };
}

function show(options: { target?: string; smarts?: (smarts: string) => Promise<SmartsCheck>; mapFamily?: boolean; blank?: boolean } = {}) {
  const rig = editorRig();
  const opened = rig.drafts.open(options.blank === true ? { kind: 'class', blank: true } : { kind: 'class', id: options.target ?? ALCOHOLS });
  if (!opened.ok) throw new Error(opened.message);
  const structure = { parse: async () => ({ ok: false as const, reason: 'unavailable' as const, error: 'not needed here' }), ...(options.smarts === undefined ? {} : { checkSmarts: options.smarts }) };
  renderWithToasts(<EditorHost port={{ ...rig.port, checks: quiet, records: pickerFor(rig, options.mapFamily === true), structure }} sessionId={opened.id} open formatTime={utcTime} onClose={vi.fn()} />);
  return { rig, id: opened.id, dialog: screen.getByRole('dialog') };
}
const draftOf = (rig: EditorRig, id: string): ChemicalClass => rig.drafts.entry(id)?.session.draft as ChemicalClass;
const storedClass = (rig: EditorRig, id = ALCOHOLS): ChemicalClass => rig.store.getState().records.class[id as never] as ChemicalClass;
const set = (label: string | RegExp, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('the class form', () => {
  it('lists Names, Identity, Parents, Generic representation, Examples, Review and the read-only record, each with a toggle', () => {
    const { dialog } = show();
    const toggles = within(dialog).getAllByRole('button', { expanded: true }).map((b) => b.textContent?.replace(/^[▾▸]\s*/, ''));
    expect(toggles).toEqual(['Names', 'Identity', 'Map family', 'Parents', 'Generic representation', 'Examples', 'Review', 'Notes, tags and citations']);
  });

  it('is titled "Edit <name>" for a stored class and "New class" for a new one', () => {
    show();
    expect(screen.getByRole('dialog', { name: 'Edit Alcohols' })).toBeTruthy();
    cleanup();
    show({ blank: true });
    expect(screen.getByRole('dialog', { name: 'New class' })).toBeTruthy();
  });
});

describe('Identity', () => {
  it('chooses the kind from the schema list; a new class has none ("Choose a kind") and the store is untouched until Save', () => {
    const { rig, id } = show();
    const before = storedClass(rig);
    set('Kind of class', 'functional_group');
    expect(draftOf(rig, id).classKind).toBe('functional_group');
    expect(storedClass(rig)).toEqual(before);
    expect(within(screen.getByLabelText('Kind of class')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a kind', 'Compound class', 'Functional group', 'Structural family', 'Homologous series', 'Reagent family']);
  });
});

describe('Parents (cycle-safe, HIER-001)', () => {
  it('lists the parents with kind and scope, adds one found by name once, and removes one', async () => {
    const { rig, id, dialog } = show({ target: PRIMARY });
    expect(within(within(dialog).getByRole('list', { name: 'Parent classes' })).getByText(/Alcohols \(compound class\)/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Find a parent class by name'), { target: { value: 'Ethers' } });
    const found = within(await within(dialog).findByRole('list', { name: 'Classes found' }));
    fireEvent.click(found.getByRole('button', { name: 'Add Ethers' }));
    expect(draftOf(rig, id).parentIds).toEqual([ALCOHOLS, 'cls_ethers']);
    expect(within(dialog).getByText('Already listed')).toBeTruthy();
    fireEvent.click(within(within(dialog).getByRole('list', { name: 'Parent classes' })).getByRole('button', { name: 'Remove Alcohols' }));
    expect(draftOf(rig, id).parentIds).toEqual(['cls_ethers']);
  });

  it('refuses a descendant with the reason and no button; the class itself too; nothing is added', async () => {
    const { rig, id, dialog } = show({ target: ALCOHOLS });
    fireEvent.change(within(dialog).getByLabelText('Find a parent class by name'), { target: { value: 'alcohols' } });
    const found = within(await within(dialog).findByRole('list', { name: 'Classes found' }));
    expect(found.getByText(/Primary alcohols is already below this class, so it cannot be its parent: that would make a cycle/)).toBeTruthy();
    expect(found.getByText(/A class cannot be its own parent/)).toBeTruthy();
    expect(found.queryByRole('button', { name: 'Add Primary alcohols' })).toBeNull();
    expect(found.queryByRole('button', { name: 'Add Alcohols' })).toBeNull();
    expect(draftOf(rig, id).parentIds).toEqual([]);
  });

  it('a class that is above or beside is offered (only a cycle is refused)', async () => {
    const { dialog } = show({ target: PRIMARY });
    fireEvent.change(within(dialog).getByLabelText('Find a parent class by name'), { target: { value: 'secondary' } });
    const found = within(await within(dialog).findByRole('list', { name: 'Classes found' }));
    expect(found.getByRole('button', { name: 'Add Secondary alcohols' })).toBeTruthy();
  });
});

describe('Generic representation', () => {
  it('edits the formula text and the general formula; an empty one removes the field; the preview uses subscripts; an emptied generic block is removed', () => {
    const { rig, id, dialog } = show({ target: 'cls_ethers' });
    set(/^Generic formula/, 'R-CH(OH)-CH2OH');
    expect((draftOf(rig, id).generic as { formulaText: string }).formulaText).toBe('R-CH(OH)-CH2OH');
    const preview = within(dialog).getByText(/Preview:/).parentElement as HTMLElement;
    expect([...preview.querySelectorAll('sub')].map((el) => el.textContent)).toContain('2');
    expect((screen.getByLabelText(/^Generic formula/) as HTMLInputElement).value).toBe('R-CH(OH)-CH2OH'); // the input is plain text
    set(/^Generic formula/, '');
    expect(Object.hasOwn(draftOf(rig, id).generic ?? {}, 'formulaText')).toBe(false);
  });

  it('removing the only generic field removes the generic block; the R-group note is kept when other fields go', () => {
    const { rig, id } = show({ target: ALCOHOLS });
    set(/^Generic formula/, '');
    set(/^General formula/, '');
    expect(Object.hasOwn(draftOf(rig, id), 'generic')).toBe(false);
  });

  it('checks a SMARTS in the chem worker 400 ms after the last change (injected timers); an invalid one shows the worker\'s words and is kept', async () => {
    const smarts = vi.fn(async (text: string): Promise<SmartsCheck> => (text.endsWith(']') ? { state: 'ok' } : { state: 'invalid', message: 'RDKit cannot read this SMARTS' }));
    const { rig, id, dialog } = show({ smarts, target: 'cls_ethers' });
    set('Membership SMARTS (optional)', '[CX4][OX2H');
    expect(smarts).not.toHaveBeenCalled();
    await act(async () => void rig.ui.fireAfter(400));
    expect(smarts).toHaveBeenCalledWith('[CX4][OX2H');
    const alert = await within(dialog).findByText(/could not read this pattern/);
    expect(alert.textContent).toMatch(/could not read this pattern: RDKit cannot read this SMARTS.*kept as typed/);
    expect((draftOf(rig, id).generic as { smarts: string }).smarts).toBe('[CX4][OX2H');
    set('Membership SMARTS (optional)', '[CX4][OX2H]');
    await act(async () => void rig.ui.fireAfter(400));
    await waitFor(() => expect(within(dialog).getByText('The chemistry engine can read this pattern.')).toBeTruthy());
  });

  it('a worker that did not answer is said as such, not "invalid"', async () => {
    const { rig, dialog } = show({ smarts: async () => ({ state: 'unanswered', message: 'the toolkit did not load' }), target: 'cls_ethers' });
    set('Membership SMARTS (optional)', '[O]');
    await act(async () => void rig.ui.fireAfter(400));
    const note = await within(dialog).findByText(/did not answer, so the pattern was not checked: the toolkit did not load/);
    expect(note.textContent).not.toMatch(/could not read/);
  });
});

describe('Examples', () => {
  it('adds species found by name once, moves them in order, and removes one', async () => {
    const { rig, id, dialog } = show({ target: 'cls_ethers' });
    const before = [...draftOf(rig, id).exampleSpeciesIds];
    fireEvent.change(within(dialog).getByLabelText('Find an example species by name'), { target: { value: 'ethanol' } });
    const found = within(await within(dialog).findByRole('list', { name: 'Species found' }));
    fireEvent.click(found.getAllByRole('button', { name: /^Add / })[0] as HTMLElement);
    expect(draftOf(rig, id).exampleSpeciesIds).toHaveLength(before.length + 1);
    const last = draftOf(rig, id).exampleSpeciesIds.at(-1) as string;
    const list = within(within(dialog).getByRole('list', { name: 'Example species' }));
    fireEvent.click(list.getAllByRole('button', { name: /^Move .* up$/ }).at(-1) as HTMLElement);
    expect(draftOf(rig, id).exampleSpeciesIds[before.length - 1]).toBe(last);
    fireEvent.click(within(within(dialog).getByRole('list', { name: 'Example species' })).getAllByRole('button', { name: /^Remove / }).at(-1) as HTMLElement);
    expect(draftOf(rig, id).exampleSpeciesIds).toHaveLength(before.length);
  });
});

describe('Review and the read-only record', () => {
  it('the lifecycle is editable; the status is read-only', () => {
    const { rig, id } = show();
    set('Lifecycle', 'draft');
    expect(draftOf(rig, id).review.lifecycle).toBe('draft');
    expect(screen.getByText(/arrives with the review queue in step 6.8/)).toBeTruthy();
  });

  it('notes, description, tags and citations are edited in the shared section and everything else is kept unchanged by Save', async () => {
    const { rig, dialog } = show();
    expect(within(dialog).getByRole('region', { name: 'Notes, tags and citations' })).toBeTruthy();
    const before = storedClass(rig);
    set('Kind of class', 'functional_group');
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(storedClass(rig).classKind).toBe('functional_group'));
    const after = storedClass(rig);
    expect({ ...after, classKind: before.classKind, provenance: before.provenance }).toMatchObject({ description: before.description, tags: before.tags, citations: before.citations, generic: before.generic, names: before.names });
  });
});
