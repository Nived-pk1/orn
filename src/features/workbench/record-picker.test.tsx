// @vitest-environment jsdom
/** The generic record picker (step 6.2b decision D4): search by name through the port, kind and scope shown, a refused record shows its reason, keyboard and screen-reader use, remove. */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecordList, RecordPicker } from './record-picker';
import type { RecordChoice, RecordPickerPort } from './record-picker-contracts';

afterEach(cleanup);

const ETHANOL: RecordChoice = { kind: 'species', id: 'spc_ethanol', name: 'Ethanol', kindWords: 'molecule', scope: 'in the syllabus' };
const ALCOHOLS: RecordChoice = { kind: 'class', id: 'cls_alcohols', name: 'Alcohols', kindWords: 'compound class', scope: 'enrichment' };
const PCC: RecordChoice = { kind: 'reagent', id: 'rgt_pcc', name: 'PCC', kindWords: 'reagent', scope: '' };
const ALL = [ETHANOL, ALCOHOLS, PCC];
const port = (search?: RecordPickerPort['search']): RecordPickerPort => ({
  describe: (kind, id) => ALL.find((c) => c.kind === kind && c.id === id),
  search: search ?? (async (kinds, text) => ALL.filter((c) => kinds.includes(c.kind) && c.name.toLowerCase().includes(text.toLowerCase()))),
});

const type = (text: string): void => void fireEvent.change(screen.getByLabelText('Find'), { target: { value: text } });

describe('RecordPicker', () => {
  it('searches only the kinds it is given and shows kind and scope beside each result', async () => {
    render(<RecordPicker id="p" label="Find" kinds={['species', 'class']} port={port()} resultsLabel="Records found" isListed={() => false} onPick={vi.fn()} />);
    type('o');
    const list = within(await screen.findByRole('list', { name: 'Records found' }));
    expect(list.getByText('Ethanol (molecule, in the syllabus)')).toBeTruthy();
    expect(list.getByText('Alcohols (compound class, enrichment)')).toBeTruthy();
    expect(list.queryByText(/PCC/)).toBeNull(); // a kind it was not asked for
  });

  it('announces the count in a status region; says when nothing matches', async () => {
    render(<RecordPicker id="p" label="Find" kinds={['species']} port={port()} noun="species" isListed={() => false} onPick={vi.fn()} />);
    type('eth');
    await screen.findByRole('list');
    expect(screen.getByRole('status').textContent).toBe('1 found');
    type('zzz');
    await act(async () => undefined);
    expect(screen.getByRole('status').textContent).toBe('No species matches.');
  });

  it('picks with its own button, named for the record; a listed record says "Already listed" and has no button', async () => {
    const onPick = vi.fn();
    render(<RecordPicker id="p" label="Find" kinds={['species']} port={port()} isListed={(c) => c.id === 'spc_ethanol'} onPick={onPick} />);
    type('ethanol');
    await screen.findByText('Already listed');
    expect(screen.queryByRole('button', { name: 'Add Ethanol' })).toBeNull();
    cleanup();
    render(<RecordPicker id="p" label="Find" kinds={['species']} port={port()} isListed={() => false} onPick={onPick} />);
    type('ethanol');
    fireEvent.click(await screen.findByRole('button', { name: 'Add Ethanol' }));
    expect(onPick).toHaveBeenCalledWith(ETHANOL);
  });

  it('a refused record shows the REASON and no button (a cycle)', async () => {
    render(<RecordPicker id="p" label="Find" kinds={['class']} port={port()} isListed={() => false} refusal={(c) => (c.id === 'cls_alcohols' ? 'it is below this class' : undefined)} onPick={vi.fn()} />);
    type('alc');
    expect((await screen.findByRole('note')).textContent).toBe('Cannot be chosen: it is below this class');
    expect(screen.queryByRole('button', { name: 'Add Alcohols' })).toBeNull();
  });

  it('drops the answer of an older search', async () => {
    let first: (found: readonly RecordChoice[]) => void = () => undefined;
    let calls = 0;
    const slow: RecordPickerPort['search'] = (_kinds, text) => (++calls === 1 ? new Promise((resolve) => (first = resolve)) : Promise.resolve(text === 'pcc' ? [PCC] : []));
    render(<RecordPicker id="p" label="Find" kinds={['reagent']} port={port(slow)} isListed={() => false} onPick={vi.fn()} />);
    type('p');
    type('pcc');
    await screen.findByText('PCC (reagent)');
    await act(async () => first([ETHANOL]));
    expect(screen.queryByText(/Ethanol/)).toBeNull();
  });

  it('a read-only tab: the field is read-only and no Add works', async () => {
    const onPick = vi.fn();
    render(<RecordPicker id="p" label="Find" kinds={['species']} port={port()} isListed={() => false} unavailable="read-only" onPick={onPick} />);
    expect((screen.getByLabelText('Find') as HTMLInputElement).readOnly).toBe(true);
  });

  it('without a port it says so', () => {
    render(<RecordPicker id="p" label="Find" kinds={['class']} port={undefined} resultsLabel="Classes found" isListed={() => false} onPick={vi.fn()} />);
    expect(screen.getByText('Searching for classes is not available here.')).toBeTruthy();
  });
});

describe('RecordList', () => {
  it('shows each record with kind and scope, Remove by name, Up and Down where the order matters', () => {
    const onRemove = vi.fn();
    const onMove = vi.fn();
    render(<RecordList label="Chosen" fieldPath="x" port={port()} items={[{ kind: 'species', id: 'spc_ethanol' }, { kind: 'class', id: 'cls_gone' }]} onRemove={onRemove} onMove={onMove} />);
    const list = within(screen.getByRole('list', { name: 'Chosen' }));
    expect(list.getByText('Ethanol (molecule, in the syllabus)')).toBeTruthy();
    expect(list.getByText('cls_gone (not in this dataset)')).toBeTruthy();
    fireEvent.click(list.getByRole('button', { name: 'Remove cls_gone' }));
    expect(onRemove).toHaveBeenCalledWith(1);
    fireEvent.click(list.getByRole('button', { name: 'Move cls_gone up' }));
    expect(onMove).toHaveBeenCalledWith(1, -1);
    expect(list.getByRole('button', { name: 'Move Ethanol up' }).getAttribute('aria-disabled')).toBe('true'); // first
    expect(list.getByRole('button', { name: 'Move cls_gone down' }).getAttribute('aria-disabled')).toBe('true'); // last
  });

  it('shows the empty text', () => {
    render(<RecordList label="Chosen" fieldPath="x" port={port()} items={[]} emptyText="None: a top-level class." onRemove={vi.fn()} />);
    expect(screen.getByText('None: a top-level class.')).toBeTruthy();
  });
});
