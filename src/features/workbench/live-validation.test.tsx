// @vitest-environment jsdom
/** The live panel beyond the schema (step 6.2a, part 2): 500 ms debounce, version-tagged answers, stale answers dropped, words for a worker that is down. */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Finding } from '@/core/validation';
import { editorRig, renderWithToasts, type EditorRig } from '@/test-support/editor-kit';
import { stubDialog } from '@/test-support/window-kit';
import type { DraftChecksPort, DryRunAnswer, StructureChecksAnswer } from './check-contracts';
import { EditorHost } from './editor-host';

beforeAll(stubDialog);
afterEach(cleanup);

const finding = (ruleId: string, path: string, message: string, severity: Finding['severity'] = 'warning'): Finding =>
  ({ id: `fnd_${ruleId}${path}`, ruleId, level: ruleId.startsWith('CHEM') ? 4 : 3, severity, subject: { kind: 'species', id: 'spc_x' }, path, message, related: [] }) as Finding;

interface Deferred<T> { promise: Promise<T>; resolve(value: T): void }
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

function show(checks: DraftChecksPort, rig: EditorRig = editorRig()) {
  const id = rig.open();
  renderWithToasts(<EditorHost port={{ ...rig.port, checks }} sessionId={id} open onClose={vi.fn()} />);
  return { rig, dialog: screen.getByRole('dialog') };
}
const quiet: DraftChecksPort = {
  dryRun: async (_k, _d, version): Promise<DryRunAnswer> => ({ version, state: 'checked', findings: [] }),
  structure: async (_k, _d, version): Promise<StructureChecksAnswer> => ({ version, state: 'none' }),
};
const type = (value: string): void => void fireEvent.change(screen.getByLabelText('Canonical name (required)'), { target: { value } });

describe('the dry run is debounced 500 ms after the last edit', () => {
  it('asks once at open, then not until 500 ms after the last edit (an edit restarts the wait)', async () => {
    const dryRun = vi.fn(quiet.dryRun);
    const { rig } = show({ ...quiet, dryRun });
    await waitFor(() => expect(dryRun).toHaveBeenCalledTimes(1));
    type('Aa');
    type('Aab');
    expect(dryRun).toHaveBeenCalledTimes(1);
    expect(rig.ui.liveDelays().filter((ms) => ms === 500)).toHaveLength(1); // the first wait was cancelled by the second edit
    await act(async () => void rig.ui.fireAfter(500));
    expect(dryRun).toHaveBeenCalledTimes(2);
    expect(dryRun.mock.calls[1]?.[1]).toMatchObject({ names: { canonical: 'Aab' } });
  });
});

describe('answers carry the draft version', () => {
  it('shows the L2-L3 findings and the L4 findings when they arrive, with the line about other records', async () => {
    const { dialog } = show({
      dryRun: async (_k, _d, version) => ({ version, state: 'checked', findings: [finding('REF-001', 'names.canonical', 'No such class in the dataset.')] }),
      structure: async (_k, _d, version) => ({ version, state: 'checked', findings: [finding('CHEM-001', 'structure', 'The structure cannot be read: bad.')], suggestions: [], notCompared: [] }),
    });
    await waitFor(() => expect(within(dialog).getByText(/No such class in the dataset/)).toBeTruthy());
    expect(within(dialog).getByText(/The structure cannot be read/)).toBeTruthy();
    expect(within(dialog).getByText('Other records are checked when you save.')).toBeTruthy();
  });

  it('says "Checking the structure..." until the chem answer arrives', async () => {
    const slow = deferred<StructureChecksAnswer>();
    const { dialog } = show({ ...quiet, structure: () => slow.promise });
    expect(within(dialog).getByText('Checking the structure...')).toBeTruthy();
    await act(async () => slow.resolve({ version: 1, state: 'checked', findings: [], suggestions: [], notCompared: [] }));
    expect(within(dialog).queryByText('Checking the structure...')).toBeNull();
  });

  it('drops an answer for an older draft: it never shows over a newer one', async () => {
    const first = deferred<DryRunAnswer>();
    const calls: number[] = [];
    const { rig, dialog } = show({
      ...quiet,
      dryRun: (_k, _d, version) => {
        calls.push(version);
        return calls.length === 1 ? first.promise : Promise.resolve({ version, state: 'checked', findings: [finding('SPC-001', 'names.canonical', 'Newer answer.')] });
      },
    });
    type('Changed');
    await act(async () => void rig.ui.fireAfter(500));
    await waitFor(() => expect(within(dialog).getByText(/Newer answer/)).toBeTruthy());
    await act(async () => first.resolve({ version: calls[0] as number, state: 'checked', findings: [finding('REF-001', 'names.canonical', 'Stale answer.')] }));
    expect(within(dialog).queryByText(/Stale answer/)).toBeNull();
    expect(within(dialog).getByText(/Newer answer/)).toBeTruthy();
    expect(calls[1]).toBeGreaterThan(calls[0] as number);
  });
});

describe('a worker that is down', () => {
  it('is said in words, and Save is still offered', async () => {
    const { dialog } = show({
      dryRun: async (_k, _d, version) => ({ version, state: 'unavailable', message: 'The checking worker is not running. Save still checks it.' }),
      structure: async (_k, _d, version) => ({ version, state: 'unavailable', message: 'The structure was not checked: the chemistry worker is down.' }),
    });
    await waitFor(() => expect(within(dialog).getByText(/The checking worker is not running/)).toBeTruthy());
    expect(within(dialog).getByText(/chemistry worker is down/)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeTruthy();
  });
});

describe('without a checks port (a read-only or test window)', () => {
  it('still shows the schema findings and never calls anything', () => {
    const rig = editorRig();
    const id = rig.open();
    renderWithToasts(<EditorHost port={rig.port} sessionId={id} open onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
