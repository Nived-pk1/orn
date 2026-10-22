// @vitest-environment jsdom
/**
 * "Create new" in the record pickers (step 6.7a decision C1): one row per kind the picker allows, once text is typed; it opens a nested
 * editor with the typed text as the name and picks the saved record into the parent; one level only; the picker holds the focus when it
 * opens the nested editor (so the dialog returns the focus to it).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateNewContext, nameSeed, type CreateNewApi } from './create-new';
import { RecordPicker } from './record-picker';
import type { RecordChoice, RecordPickerPort } from './record-picker-contracts';

afterEach(cleanup);

const ETHANAL: RecordChoice = { kind: 'species', id: 'spc_ethanal', name: 'Ethanal', kindWords: 'molecule', scope: '' };
const port: RecordPickerPort = {
  describe: (kind, id) => (kind === 'species' && id === 'spc_ethanal' ? ETHANAL : undefined),
  search: async () => [],
};
const type = (text: string): void => void fireEvent.change(screen.getByLabelText('Find'), { target: { value: text } });
const show = (api: CreateNewApi | undefined, kinds: Parameters<typeof RecordPicker>[0]['kinds'], onPick = vi.fn()) =>
  render(
    <CreateNewContext.Provider value={api}>
      <RecordPicker id="p" label="Find" kinds={kinds} port={port} noun="record" isListed={() => false} onPick={onPick} />
    </CreateNewContext.Provider>,
  );

describe('the Create new rows', () => {
  it('there is one per allowed kind, once text is typed; none for a kind with no editor; none without text or without a nested-editor host', async () => {
    show({ nested: false, start: vi.fn() }, ['species', 'class', 'route']);
    expect(screen.queryByRole('button', { name: /^Create new/ })).toBeNull();
    type('  Zz propanal test ');
    await act(async () => undefined);
    expect(screen.getByRole('button', { name: 'Create new species "Zz propanal test"' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create new class "Zz propanal test"' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /route/i })).toBeNull();
    cleanup();
    show(undefined, ['species']);
    type('x');
    await act(async () => undefined);
    expect(screen.queryByRole('button', { name: /^Create new/ })).toBeNull();
  });

  it('clicking starts a nested editor for that kind with the typed text; the picker holds the focus; the saved record is picked once', async () => {
    const onPick = vi.fn();
    let focused: Element | null = null;
    let finish: ((ref: { kind: string; id: string }) => void) | undefined;
    const start = vi.fn((_kind: string, _name: string, done: (ref: { kind: string; id: string }) => void) => {
      focused = document.activeElement;
      finish = done;
    });
    show({ nested: false, start: start as unknown as CreateNewApi['start'] }, ['species'], onPick);
    type('Zz propanal test');
    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Create new species "Zz propanal test"' }));
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0]?.slice(0, 2)).toEqual(['species', 'Zz propanal test']);
    expect(focused).toBe(screen.getByLabelText('Find'));
    expect(onPick).not.toHaveBeenCalled(); // nothing is picked before the nested Save
    finish?.({ kind: 'species', id: 'spc_ethanal' });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(ETHANAL);
  });

  it('inside a nested editor there is no Create new, only the sentence', async () => {
    show({ nested: true, start: vi.fn() }, ['species', 'class']);
    type('abc');
    await act(async () => undefined);
    expect(screen.queryByRole('button', { name: /^Create new/ })).toBeNull();
    expect(screen.getByText('Finish this one first: one new record at a time')).toBeTruthy();
  });
});

describe('nameSeed', () => {
  it('puts the text where the kind keeps its name', () => {
    expect(nameSeed('species', 'X')).toEqual({ names: { canonical: 'X', common: [], aliases: [] } });
    expect(nameSeed('class', 'X')).toEqual({ names: { canonical: 'X', common: [], aliases: [] } });
    expect(nameSeed('reagent', 'X')).toEqual({ names: { canonical: 'X', common: [], aliases: [] } });
    expect(nameSeed('reaction', 'X')).toEqual({ name: 'X' });
    expect(nameSeed('concept', 'X')).toEqual({ name: 'X' });
    expect(nameSeed('reference', 'X')).toEqual({ title: 'X' });
    expect(nameSeed('caveat', 'X')).toEqual({ title: 'X' });
  });
});
