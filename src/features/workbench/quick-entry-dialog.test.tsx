// @vitest-environment jsdom
/**
 * The quick-entry dialog (step 6.7b, Q1, Q3, Q4) over a fake port: one text line with three examples, the review below it (each term on a
 * line with its state, the condition text with its parsed fields, the scope in words, a similar reaction, the live preview) and the
 * "Open in the reaction editor" button that is available only when every term is resolved. The grammar, the seed and the resolution are
 * tested in their own files; here the screen.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RecordRef } from '@/core/schema';
import { stubDialog } from '@/test-support/window-kit';
import type { FindResult, QuickEntryPort, StructureAnswer } from './quick-entry-contracts';
import type { RecordChoice } from './record-picker-contracts';
import { QuickEntryDialog } from './quick-entry-dialog';

beforeAll(stubDialog);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const choice = (kind: RecordChoice['kind'], id: string, name: string, kindWords = kind as string): RecordChoice => ({ kind, id, name, kindWords, scope: '' });
const TABLE: Record<string, RecordChoice[]> = {
  ethanol: [choice('species', 'spc_ethanol', 'Ethanol')],
  ethanal: [choice('species', 'spc_ethanal', 'Ethanal')],
  pcc: [choice('reagent', 'rgt_pcc', 'PCC')],
  'primary alcohols': [choice('class', 'cls_alcohols-primary', 'Primary alcohols', 'compound class')],
  both: [choice('species', 'spc_both-a', 'Both A'), choice('species', 'spc_both-b', 'Both B')],
};

interface Rig {
  readonly port: QuickEntryPort;
  readonly open: ReturnType<typeof vi.fn>;
  readonly createNew: ReturnType<typeof vi.fn>;
  readonly openRecord: ReturnType<typeof vi.fn>;
  readonly known: Map<string, RecordChoice>;
}
function rig(options: { structure?: (text: string) => StructureAnswer; similar?: QuickEntryPort['similar']; suggestions?: RecordChoice[] } = {}): Rig {
  const known = new Map<string, RecordChoice>();
  for (const list of Object.values(TABLE)) for (const c of list) known.set(`${c.kind}:${c.id}`, c);
  const open = vi.fn();
  const createNew = vi.fn();
  const openRecord = vi.fn();
  let n = 0;
  const port: QuickEntryPort = {
    find: async (text): Promise<FindResult> => ({ exact: TABLE[text.toLowerCase()] ?? [], suggestions: options.suggestions ?? [] }),
    structure: async (text) => options.structure?.(text) ?? { state: 'not_structure' },
    describe: (ref) => known.get(`${ref.kind}:${ref.id}`),
    similar: options.similar ?? (() => []),
    preview: undefined,
    createNew: (kind, seed, done) => createNew(kind, seed, done),
    openRecord: (ref: RecordRef) => openRecord(ref),
    open: (seed) => open(seed),
    newId: (prefix) => `${prefix}_d${(n += 1)}`,
  };
  return { port, open, createNew, openRecord, known };
}
function show(r: Rig, line = '', extra: { onClose?: () => void; onLine?: (line: string) => void } = {}) {
  return render(<QuickEntryDialog port={r.port} initialLine={line} onLine={extra.onLine ?? (() => undefined)} onClose={extra.onClose ?? (() => undefined)} />);
}
const dialog = (): HTMLElement => screen.getByRole('dialog', { name: 'Quick entry' });
const type = (text: string): void => void fireEvent.change(within(dialog()).getByLabelText('Reaction line'), { target: { value: text } });
const termRow = async (text: string): Promise<HTMLElement> => {
  const rows = await within(dialog()).findAllByTestId('quick-term');
  const found = rows.find((row) => row.getAttribute('data-term') === text);
  if (found === undefined) throw new Error(`no row for ${text}`);
  return found;
};

describe('the line and its examples', () => {
  it('shows one text line and three examples; an example fills the line', () => {
    show(rig());
    const examples = within(dialog()).getByRole('list', { name: 'Examples' });
    expect(within(examples).getAllByRole('button')).toHaveLength(3);
    fireEvent.click(within(examples).getAllByRole('button')[0] as HTMLElement);
    expect((within(dialog()).getByLabelText('Reaction line') as HTMLInputElement).value).toBe('ethanol + PCC (CH2Cl2) -> ethanal');
  });
  it('a line with an error shows its words and position, and no review', async () => {
    show(rig(), 'ethanol + -> ethanal');
    const problems = await within(dialog()).findByRole('list', { name: 'Problems with the line' });
    expect(problems.textContent).toContain("after 'ethanol +'");
    expect(problems.textContent).toMatch(/Character 11/);
    expect(within(dialog()).queryByRole('list', { name: 'Terms' })).toBeNull();
    expect(within(dialog()).queryByRole('button', { name: 'Open in the reaction editor' })).toBeNull();
  });
  it('Close keeps the typed line: onLine hears every change and a new dialog starts from it', () => {
    const heard: string[] = [];
    const first = show(rig(), '', { onLine: (line) => heard.push(line) });
    type('a -> b');
    expect(heard.at(-1)).toBe('a -> b');
    first.unmount();
    show(rig(), 'a -> b');
    expect((within(dialog()).getByLabelText('Reaction line') as HTMLInputElement).value).toBe('a -> b');
  });
});

describe('the review of each term', () => {
  it('resolved terms show their name and kind; the condition text shows what was read and what was not', async () => {
    show(rig(), 'ethanol + PCC (CH2Cl2, 0 °C) -> ethanal');
    const ethanol = await termRow('ethanol');
    await waitFor(() => expect(ethanol.textContent).toContain('Ethanol'));
    expect(ethanol.textContent).toContain('species');
    expect((await termRow('PCC')).textContent).toContain('reagent');
    expect((await termRow('ethanal')).textContent).toContain('Ethanal');
    const conditions = within(dialog()).getByRole('group', { name: 'Conditions of stage 1' });
    expect(conditions.textContent).toContain('CH2Cl2, 0 °C');
    expect(conditions.textContent).toMatch(/0 °C.*temperature.*needs? (to be )?confirm/i);
    expect(conditions.textContent).toMatch(/Not recognised.*CH2Cl2/);
  });
  it('"Which one?" lists the candidates and choosing one resolves the term', async () => {
    show(rig(), 'both -> ethanal');
    const row = await termRow('both');
    await waitFor(() => expect(row.textContent).toContain('Which one?'));
    fireEvent.click(within(row).getByRole('button', { name: /Use Both B/ }));
    await waitFor(() => expect(row.textContent).toContain('Both B'));
    expect(row.textContent).not.toContain('Which one?');
  });
  it('a name that is not found offers up to five suggestions and Create new species / reagent; Create new resolves the term when it is saved', async () => {
    const r = rig({ suggestions: [choice('species', 'spc_ethanol', 'Ethanol')] });
    show(r, 'zzz -> ethanal');
    const row = await termRow('zzz');
    await waitFor(() => expect(row.textContent).toContain('Not found'));
    expect(within(row).getByRole('button', { name: 'Use Ethanol (species)' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Create new reagent "zzz"' })).toBeTruthy();
    fireEvent.click(within(row).getByRole('button', { name: 'Create new species "zzz"' }));
    expect(r.createNew).toHaveBeenCalledTimes(1);
    const [kind, seed, done] = r.createNew.mock.calls[0] as ['species', Record<string, unknown>, (ref: RecordRef) => void];
    expect(kind).toBe('species');
    expect(seed).toEqual({ names: { canonical: 'zzz', common: [], aliases: [] } });
    r.known.set('species:spc_zzz', choice('species', 'spc_zzz', 'Zzz'));
    done({ kind: 'species', id: 'spc_zzz' });
    await waitFor(() => expect(row.textContent).toContain('Zzz'));
    expect(row.textContent).not.toContain('Not found');
  });
  it('a SMILES term that matches a species is resolved by structure; one that matches none is offered as a new species with that structure', async () => {
    const r = rig({ structure: (text) => (text === 'CCO' ? { state: 'matched', matches: [choice('species', 'spc_ethanol', 'Ethanol')] } : text === 'C1CCCCC1' ? { state: 'new' } : { state: 'not_structure' }) });
    show(r, 'CCO + C1CCCCC1 -> ethanal');
    const matched = await termRow('CCO');
    await waitFor(() => expect(matched.textContent).toContain('Ethanol'));
    expect(matched.textContent).toMatch(/matched by structure/i);
    const fresh = await termRow('C1CCCCC1');
    await waitFor(() => expect(within(fresh).getByRole('button', { name: 'Create new species with this structure' })).toBeTruthy());
    fireEvent.click(within(fresh).getByRole('button', { name: 'Create new species with this structure' }));
    expect(r.createNew.mock.calls[0]?.[1]).toEqual({ names: { canonical: '', common: [], aliases: [] }, structure: { format: 'smiles', value: 'C1CCCCC1' } });
  });
  it('the chem worker not answering is said in words', async () => {
    show(rig({ structure: () => ({ state: 'unanswered', message: 'the structure toolkit is not available' }) }), 'CCO -> ethanal');
    const row = await termRow('CCO');
    await waitFor(() => expect(row.textContent).toContain('the structure toolkit is not available'));
  });
});

describe('scope, similar reaction and Open', () => {
  it('scope in words: specific when every term is a species, generic when any is a class, choose for a reagent mix; changeable', async () => {
    show(rig(), 'ethanol -> ethanal');
    await waitFor(() => expect(within(dialog()).getByTestId('quick-scope').textContent).toMatch(/Specific: every term is a species/));
    expect((within(dialog()).getByLabelText('Scope') as HTMLSelectElement).value).toBe('specific');
    cleanup();
    show(rig(), 'primary alcohols + ethanol -> ethanal');
    await waitFor(() => expect(within(dialog()).getByTestId('quick-scope').textContent).toMatch(/Generic: at least one term is a class/));
    cleanup();
    show(rig(), 'ethanol + PCC -> ethanal');
    await waitFor(() => expect(within(dialog()).getByTestId('quick-scope').textContent).toMatch(/Choose a scope/));
    expect((within(dialog()).getByLabelText('Scope') as HTMLSelectElement).value).toBe('');
    fireEvent.change(within(dialog()).getByLabelText('Scope'), { target: { value: 'generic' } });
    expect((within(dialog()).getByLabelText('Scope') as HTMLSelectElement).value).toBe('generic');
    expect(within(dialog()).getByTestId('quick-scope').textContent).toMatch(/you chose generic/i);
  });
  it('a similar reaction is announced with Open', async () => {
    const r = rig({ similar: () => [{ id: 'rxn_existing', name: 'Ethanol to ethanal' }] });
    show(r, 'ethanol -> ethanal');
    const note = await within(dialog()).findByText('A similar reaction exists: Ethanol to ethanal');
    expect(note).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Open Ethanol to ethanal' }));
    expect(r.openRecord).toHaveBeenCalledWith({ kind: 'reaction', id: 'rxn_existing' });
  });
  it('"Open in the reaction editor" is available only when every term is resolved, then opens a seeded draft and closes', async () => {
    const r = rig();
    const onClose = vi.fn();
    show(r, 'ethanol + both -> ethanal', { onClose });
    const open = within(dialog()).getByRole('button', { name: 'Open in the reaction editor' });
    expect(open.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(open);
    expect(r.open).not.toHaveBeenCalled();
    const row = await termRow('both');
    await waitFor(() => expect(row.textContent).toContain('Which one?'));
    fireEvent.click(within(row).getByRole('button', { name: /Use Both A/ }));
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: 'Open in the reaction editor' }).getAttribute('aria-disabled')).toBeNull());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Open in the reaction editor' }));
    expect(r.open).toHaveBeenCalledTimes(1);
    const seed = r.open.mock.calls[0]?.[0] as { name: string; participants: { ref: { id: string } }[]; outcomes: { selectivity: string; conditionVariantIds: unknown[] }[] };
    expect(seed.name).toBe('ethanol + both → ethanal');
    expect(seed.participants.map((p) => p.ref.id)).toEqual(['spc_ethanol', 'spc_both-a']);
    expect(seed.outcomes).toHaveLength(1);
    expect(seed.outcomes[0]?.selectivity).toBe('unspecified');
    expect(onClose).toHaveBeenCalled();
  });
  it('the scope the user chose is in the seed; "Choose" leaves it out', async () => {
    const r = rig();
    show(r, 'ethanol + PCC -> ethanal');
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: 'Open in the reaction editor' }).getAttribute('aria-disabled')).toBeNull());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Open in the reaction editor' }));
    expect(r.open.mock.calls[0]?.[0]).not.toHaveProperty('scope');
    cleanup();
    const again = rig();
    show(again, 'ethanol + PCC -> ethanal');
    await waitFor(() => expect(within(dialog()).getByRole('button', { name: 'Open in the reaction editor' }).getAttribute('aria-disabled')).toBeNull());
    fireEvent.change(within(dialog()).getByLabelText('Scope'), { target: { value: 'specific' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Open in the reaction editor' }));
    expect(again.open.mock.calls[0]?.[0]).toMatchObject({ scope: 'specific' });
  });
});
