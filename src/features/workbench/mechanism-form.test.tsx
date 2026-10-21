// @vitest-environment jsdom
/**
 * The mechanism editor's Identity, Summary and Variants (step 6.5a part 3, D2, D3, D6, D7) over the real store and session manager, on the demo's
 * three mechanisms: sections, summary lines, one open variant at a time, add / reorder / remove (asks), a variant an outcome uses cannot be removed
 * and says which outcome, a new mechanism with only a summary, the read-only fields kept unchanged, the rich-text summary.
 */
import { utcTime } from '@/test-support/editing-kit';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { outcomeUsesOfVariant } from '@/core/editing';
import type { Mechanism } from '@/core/schema';
import { PHONE_QUERIES } from '@/ui/hooks';
import { editorRig, renderWithToasts, type EditorRig } from '@/test-support/editor-kit';
import { stubDialog } from '@/test-support/window-kit';
import type { DraftChecksPort } from './check-contracts';
import { EditorHost } from './editor-host';
import type { MechanismLinksPort } from './mechanism-contracts';

beforeAll(stubDialog);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const quiet: DraftChecksPort = {
  dryRun: async (_k, _d, version) => ({ version, state: 'checked', findings: [] }),
  structure: async (_k, _d, version) => ({ version, state: 'none' }),
};
const E2 = 'mec_e2-haloalkane';
const ALDOL = 'mec_aldol-ethanal';

function linksOf(rig: EditorRig): MechanismLinksPort {
  return {
    variantUses: (mechanismId, variantId) => outcomeUsesOfVariant(rig.store.getState(), mechanismId, variantId),
    variantsOf: () => [],
    exists: (ref) => (rig.store.getState().records as unknown as Record<string, Record<string, unknown>>)[ref.kind]?.[ref.id] !== undefined,
    name: () => undefined,
  };
}
function show(target: { id: string } | { blank: true }, phone = false) {
  if (phone) {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false }));
  }
  const rig = editorRig();
  const opened = rig.drafts.open('id' in target ? { kind: 'mechanism', id: target.id } : { kind: 'mechanism', blank: true });
  if (!opened.ok) throw new Error(opened.message);
  const onClose = vi.fn();
  renderWithToasts(<EditorHost port={{ ...rig.port, checks: quiet, links: linksOf(rig) }} sessionId={opened.id} open formatTime={utcTime} onClose={onClose} />);
  return { rig, id: opened.id, onClose };
}
const draftOf = (rig: EditorRig, id: string): Mechanism => rig.drafts.entry(id)?.session.draft as Mechanism;
const rows = (): HTMLElement[] => screen.queryAllByTestId('mech-variant-row');
const summary = (n: number): string => screen.getAllByTestId('mech-variant-summary')[n - 1]?.textContent ?? '';
const edit = (n: number) => fireEvent.click(screen.getByRole('button', { name: `Edit variant ${n}` }));
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const changeBox = (name: string, value: string) => fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } });
const isOff = (el: HTMLElement): boolean => el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled;

describe('the mechanism editor sections', () => {
  it('has Identity, Summary, Variants, Review and a read-only section; the title names the mechanism', () => {
    show({ id: E2 });
    expect(screen.getByRole('dialog', { name: 'Edit E2 elimination of a haloalkane' })).toBeTruthy();
    for (const name of ['Identity', 'Summary', 'Variants', 'Review']) expect(screen.getByRole('region', { name })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Notes, tags and citations' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Mechanism classes' })).toBeTruthy();
    expect(screen.getAllByText(/Editing arrives in step 6\.6a/).length).toBeGreaterThan(0);
  });

  it('name and aliases are edited as typed; the fields the editor does not name stay unchanged', () => {
    const { rig, id } = show({ id: E2 });
    const before = draftOf(rig, id);
    change('Name (required)', 'E2 (renamed) ');
    fireEvent.click(screen.getByRole('button', { name: 'Add alias' }));
    change('Alias 1', ' second name');
    const after = draftOf(rig, id);
    expect(after.name).toBe('E2 (renamed) ');
    expect(after.aliases).toEqual([' second name']);
    expect(after.mechanismClasses).toEqual(before.mechanismClasses);
    expect(after.conceptIds).toEqual(before.conceptIds);
    expect(after.provenance).toEqual(before.provenance);
  });

  it('the summary is a rich-text field: a preview, stored as typed, an empty text removes it', () => {
    const { rig, id } = show({ id: E2 });
    changeBox('Summary', 'A *one-step* elimination.');
    expect(draftOf(rig, id).summary).toBe('A *one-step* elimination.');
    expect(within(screen.getByRole('region', { name: 'Preview of Summary' })).getByText('one-step').tagName).toBe('EM');
    changeBox('Summary', '');
    expect(Object.hasOwn(draftOf(rig, id), 'summary')).toBe(false);
  });
});

describe('the variant summary lines', () => {
  it('each variant is ONE line "<label> · <n> steps · <applicability>"; no field is on the page', () => {
    show({ id: E2 });
    expect(rows()).toHaveLength(2);
    expect(summary(1)).toMatch(/^1\. Saytzeff elimination \(small base\) · 1 step · Small base such as ethoxide/);
    expect(summary(2)).toMatch(/^2\. Hofmann-type elimination \(bulky base\) · 1 step · Bulky base/);
    expect(screen.queryByLabelText('Label of variant 1')).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit variant 1' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('Edit opens one variant at a time: label, applicability (rich text) and rate law as typed; the line follows', () => {
    const { rig, id } = show({ id: E2 });
    edit(1);
    expect(screen.getByRole('button', { name: 'Close variant 1' }).getAttribute('aria-expanded')).toBe('true');
    edit(2);
    expect(screen.queryByLabelText('Label of variant 1')).toBeNull();
    expect(screen.getByLabelText('Label of variant 2')).toBeTruthy();
    edit(1);
    change('Label of variant 1', 'Zaitsev elimination');
    change('Applicability of variant 1', 'Small *base*');
    change('Rate law of variant 1', 'rate = k[RX][B]');
    expect(draftOf(rig, id).variants[0]).toMatchObject({ label: 'Zaitsev elimination', applicability: 'Small *base*', rateLaw: 'rate = k[RX][B]' });
    expect(summary(1)).toBe('1. Zaitsev elimination · 1 step · Small *base*');
    change('Rate law of variant 1', '');
    expect(Object.hasOwn(draftOf(rig, id).variants[0] as object, 'rateLaw')).toBe(false);
  });
});

describe('adding, moving and removing variants', () => {
  it('Add variant needs a label, appends a variant with no steps and opens it', () => {
    const { rig, id } = show({ id: ALDOL });
    expect(isOff(screen.getByRole('button', { name: 'Add variant' }))).toBe(true);
    change('Label of a new variant (required)', 'Enamine pathway');
    fireEvent.click(screen.getByRole('button', { name: 'Add variant' }));
    const variants = draftOf(rig, id).variants;
    expect(variants).toHaveLength(3);
    expect(variants[2]).toMatchObject({ label: 'Enamine pathway', steps: [] });
    expect(variants[2]?.id).toMatch(/^mvr_/);
    expect(summary(3)).toBe('3. Enamine pathway · 0 steps');
    expect(screen.getByLabelText('Label of variant 3')).toBeTruthy();
  });

  it('Up and Down reorder; the first has no Up', () => {
    const { rig, id } = show({ id: E2 });
    const first = draftOf(rig, id).variants[0]?.id;
    expect(isOff(screen.getByRole('button', { name: 'Move variant 1 up' }))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Move variant 1 down' }));
    expect(draftOf(rig, id).variants[1]?.id).toBe(first);
  });

  it('Remove asks first; Cancel keeps it; confirming removes it (a variant no outcome uses)', () => {
    const { rig, id } = show({ id: ALDOL });
    change('Label of a new variant (required)', 'Scratch');
    fireEvent.click(screen.getByRole('button', { name: 'Add variant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove variant 3' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Remove variant 3?' })).getByRole('button', { name: 'Cancel' }));
    expect(draftOf(rig, id).variants).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Remove variant 3' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Remove variant 3?' })).getByRole('button', { name: 'Remove the variant' }));
    expect(draftOf(rig, id).variants).toHaveLength(2);
    expect(screen.getByText('Variant 3 was removed.')).toBeTruthy();
  });

  it('a variant an outcome of any reaction links cannot be removed, and the words say which outcome', () => {
    show({ id: ALDOL });
    expect(screen.getAllByText('Outcome 1 of Aldol reaction of ethanal uses this pathway; change that link first').length).toBeGreaterThan(0);
    expect(isOff(screen.getByRole('button', { name: 'Remove variant 1' }))).toBe(true);
  });
});

describe('a new mechanism', () => {
  it('starts with the empty values and is titled "New mechanism"; a summary alone is enough content', () => {
    const { rig, id } = show({ blank: true });
    expect(screen.getByRole('dialog', { name: 'New mechanism' })).toBeTruthy();
    expect(draftOf(rig, id)).toMatchObject({ name: '', aliases: [], variants: [], review: { lifecycle: 'draft', status: 'unreviewed' }, provenance: { origin: 'user' } });
    expect(rows()).toHaveLength(0);
    expect(screen.getByText(/No variants yet/)).toBeTruthy();
    change('Name (required)', 'Oxidation of a primary alcohol by PCC (outline)');
    changeBox('Summary', 'PCC converts the alcohol to the aldehyde.');
    expect(draftOf(rig, id).summary).toBe('PCC converts the alcohol to the aldehyde.');
  });
});

describe('on a phone', () => {
  it('the long sections start closed and the rows carry the phone flag', () => {
    show({ id: E2 }, true);
    expect(screen.getByRole('button', { name: /Variants/ }).getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: /Variants/ }));
    expect(document.querySelector('[data-testid="mech-variant-row"][data-phone="true"]')).toBeTruthy();
  });
});
