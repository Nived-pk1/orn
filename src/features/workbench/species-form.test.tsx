// @vitest-environment jsdom
/** The species editor's sections (step 6.2a part 4): each section's fields as recipes, the Classes picker and suggestions, collapsing, the keys, the read-only record. */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Species } from '@/core/schema';
import { editorRig, renderWithToasts, speciesOf, type EditorRig } from '@/test-support/editor-kit';
import { stubDialog } from '@/test-support/window-kit';
import type { DraftChecksPort } from './check-contracts';
import type { ClassChoice, ClassPickerPort } from './class-picker-contracts';
import { EditorHost } from './editor-host';

beforeAll(stubDialog);
afterEach(cleanup);

const ALCOHOLS: ClassChoice = { id: 'cls_alcohols', name: 'Alcohols', kind: 'compound class', scope: 'in the syllabus' };
const ETHERS: ClassChoice = { id: 'cls_ethers', name: 'Ethers', kind: 'compound class', scope: 'enrichment' };
const picker = (): ClassPickerPort => ({
  describe: (id) => [ALCOHOLS, ETHERS].find((c) => c.id === id),
  search: async (text) => [ALCOHOLS, ETHERS].filter((c) => c.name.toLowerCase().includes(text.toLowerCase())),
});
const quiet: DraftChecksPort = {
  dryRun: async (_k, _d, version) => ({ version, state: 'checked', findings: [] }),
  structure: async (_k, _d, version) => ({ version, state: 'none' }),
};

function show(options: { rig?: EditorRig; checks?: DraftChecksPort; classes?: ClassPickerPort } = {}) {
  const rig = options.rig ?? editorRig();
  const id = rig.open();
  renderWithToasts(<EditorHost port={{ ...rig.port, checks: options.checks ?? quiet, classes: options.classes ?? picker() }} sessionId={id} open onClose={vi.fn()} />);
  return { rig, id, dialog: screen.getByRole('dialog') };
}
const draftOf = (rig: EditorRig, id: string): Species => rig.drafts.entry(id)?.session.draft as Species;
const set = (label: string | RegExp, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('the sections', () => {
  it('lists Names, Identity, Structure, Formula and charge, Stereo, Aromaticity claim, Classes, Review and the read-only record, each with a toggle', () => {
    const { dialog } = show();
    const toggles = within(dialog).getAllByRole('button', { expanded: true }).map((b) => b.textContent?.replace(/^[▾▸]\s*/, ''));
    expect(toggles).toEqual(['Names', 'Identity', 'Structure', 'Formula and charge', 'Stereo', 'Aromaticity claim', 'Classes', 'Review', 'Properties, notes and citations']);
  });

  it('Identity, Formula and charge, Aromaticity: each field edits the draft only; an empty optional field is absent', () => {
    const { rig, id } = show();
    const stored = speciesOf(rig);
    set('Kind of species', 'ion');
    set(/Isotope note/, '13C labelled');
    set('Formula (optional)', 'C2H6O');
    set(/^Charge \(/, '-1');
    set('Aromatic, antiaromatic or neither?', 'non_aromatic');
    expect(draftOf(rig, id)).toMatchObject({ speciesKind: 'ion', isotopeNote: '13C labelled', formula: 'C2H6O', charge: -1, aromaticity: 'non_aromatic' });
    set(/^Charge \(/, '');
    set(/Isotope note/, '');
    set('Aromatic, antiaromatic or neither?', '');
    expect(Object.hasOwn(draftOf(rig, id), 'charge')).toBe(false);
    expect(Object.hasOwn(draftOf(rig, id), 'isotopeNote')).toBe(false);
    expect(Object.hasOwn(draftOf(rig, id), 'aromaticity')).toBe(false);
    expect(speciesOf(rig)).toEqual(stored); // the store is untouched until Save
  });

  it('a charge that is not a whole number changes nothing (the finding comes from the schema, not a silent fix)', () => {
    const { rig, id } = show();
    set(/^Charge \(/, '2');
    set(/^Charge \(/, '2.5');
    expect(draftOf(rig, id).charge).toBe(2);
  });

  it('Stereo: choosing a statement creates it with empty descriptors; descriptors add, edit and remove; the statement cannot be cleared while it holds descriptors', () => {
    const { rig, id, dialog } = show();
    set('Stereo statement', 'single_stereoisomer');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add descriptor' }));
    set('Descriptor 1', '2R');
    expect(draftOf(rig, id).stereo).toEqual({ kind: 'single_stereoisomer', descriptors: ['2R'] });
    expect((within(screen.getByLabelText('Stereo statement')).getByRole('option', { name: 'Not stated' }) as HTMLOptionElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove descriptor 1' }));
    expect((within(screen.getByLabelText('Stereo statement')).getByRole('option', { name: 'Not stated' }) as HTMLOptionElement).disabled).toBe(false);
    set('Stereo statement', '');
    expect(Object.hasOwn(draftOf(rig, id), 'stereo')).toBe(false);
  });

  it('Review: lifecycle is editable, the review status is read-only and says verifying arrives in step 6.8', () => {
    const { rig, id, dialog } = show();
    set('Lifecycle', 'draft');
    expect(draftOf(rig, id).review.lifecycle).toBe('draft');
    expect(within(dialog).getByText(/Review status:/)).toBeTruthy();
    expect(within(dialog).getByText(/review queue in step 6\.8/)).toBeTruthy();
    expect(within(dialog).queryByLabelText(/Review status/)).toBeNull();
  });

  it('Properties, notes and citations are shown with "Editing arrives in step 6.6" and kept unchanged by a Save', async () => {
    const rig = editorRig();
    const stored = speciesOf(rig);
    const { id, dialog } = show({ rig });
    expect(within(dialog).getByText(/Editing arrives in step 6\.6/)).toBeTruthy();
    set('Kind of species', stored.speciesKind === 'ion' ? 'molecule' : 'ion');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(rig.drafts.entry(id)).toBeUndefined());
    const saved = speciesOf(rig);
    expect(saved.properties).toEqual(stored.properties);
    expect(saved.notes).toEqual(stored.notes);
    expect(saved.citations).toEqual(stored.citations);
    expect(saved.tags).toEqual(stored.tags);
  });
});

describe('the Classes section', () => {
  it('shows the listed classes with kind and scope, finds classes by name, adds one once, and removes one', async () => {
    const { rig, id, dialog } = show();
    fireEvent.change(within(dialog).getByLabelText('Find a class by name'), { target: { value: 'alc' } });
    const found = within(await within(dialog).findByRole('list', { name: 'Classes found' }));
    expect(found.getByText('Alcohols (compound class, in the syllabus)')).toBeTruthy();
    fireEvent.click(found.getByRole('button', { name: 'Add Alcohols' }));
    expect(draftOf(rig, id).classIds).toContain('cls_alcohols');
    expect(within(dialog).getAllByText('Alcohols (compound class, in the syllabus)').length).toBeGreaterThan(0);
    await waitFor(() => expect(within(within(dialog).getByRole('list', { name: 'Classes found' })).getByText('Already listed')).toBeTruthy());
    fireEvent.click(within(within(dialog).getByRole('list', { name: 'Listed classes' })).getByRole('button', { name: 'Remove Alcohols' }));
    expect(draftOf(rig, id).classIds).not.toContain('cls_alcohols');
  });

  it('a class that is not in the dataset is said so, with its ID', () => {
    const rig = editorRig();
    const { id, dialog } = show({ rig });
    act(() => rig.drafts.edit(id, (d) => void (d.classIds = ['cls_gone'])));
    expect(within(dialog).getByText('cls_gone (not in this dataset)')).toBeTruthy();
  });

  it('SUGGESTIONS from the structure check are chips "Alcohols (matches its pattern)  Add"; nothing is added by itself; Add lists the class and the chip goes', async () => {
    const checks: DraftChecksPort = { ...quiet, structure: async (_k, _d, version) => ({ version, state: 'checked', findings: [], suggestions: [{ classId: 'cls_alcohols' }], notCompared: [] }) };
    const { rig, id, dialog } = show({ checks });
    const chips = within(await within(dialog).findByRole('list', { name: 'Suggested classes' }));
    expect(chips.getByText('Alcohols (matches its pattern)')).toBeTruthy();
    expect(draftOf(rig, id).classIds).not.toContain('cls_alcohols'); // never assigned automatically
    fireEvent.click(chips.getByRole('button', { name: 'Add Alcohols' }));
    expect(draftOf(rig, id).classIds).toContain('cls_alcohols');
    expect(within(dialog).queryByRole('list', { name: 'Suggested classes' })).toBeNull();
  });

  it('without a picker the section says classes cannot be searched here', () => {
    const rig = editorRig();
    const id = rig.open();
    renderWithToasts(<EditorHost port={{ ...rig.port, checks: quiet }} sessionId={id} open onClose={vi.fn()} />);
    expect(screen.getByText('Searching for classes is not available here.')).toBeTruthy();
  });
});

describe('collapsing and the keyboard', () => {
  it('a toggle closes and opens its section (aria-expanded) and keeps the fields in the page, hidden', () => {
    const { dialog } = show();
    const toggle = within(dialog).getByRole('button', { name: /Aromaticity claim/ });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('species-aromaticity')?.closest('[hidden]')).not.toBeNull();
    fireEvent.click(toggle);
    expect(document.getElementById('species-aromaticity')?.closest('[hidden]')).toBeNull();
  });

  it('Arrow Down / Up / End / Home move between the section headings', () => {
    const { dialog } = show();
    const toggles = within(dialog).getAllByRole('button', { expanded: true });
    toggles[0]?.focus();
    fireEvent.keyDown(toggles[0] as HTMLElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(toggles[1]);
    fireEvent.keyDown(toggles[1] as HTMLElement, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(toggles[0]);
    fireEvent.keyDown(toggles[0] as HTMLElement, { key: 'End' });
    expect(document.activeElement).toBe(toggles[toggles.length - 1]);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Home' });
    expect(document.activeElement).toBe(toggles[0]);
  });

  it('a finding in a closed section opens it and focuses its field', async () => {
    const checks: DraftChecksPort = {
      ...quiet,
      structure: async (_k, _d, version) => ({
        version,
        state: 'checked',
        findings: [{ id: 'fnd_c3', ruleId: 'CHEM-003', level: 4, severity: 'warning', subject: { kind: 'species', id: 'spc_x' }, path: 'formula', message: 'The entered formula does not match.', related: [] } as never],
        suggestions: [],
        notCompared: [],
      }),
    };
    const { dialog } = show({ checks });
    fireEvent.click(within(dialog).getByRole('button', { name: /Formula and charge/ }));
    const finding = await within(dialog).findByRole('button', { name: /The entered formula does not match/ });
    fireEvent.click(finding);
    expect(within(dialog).getByRole('button', { name: /Formula and charge/ }).getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(screen.getByLabelText('Formula (optional)'));
  });
});
