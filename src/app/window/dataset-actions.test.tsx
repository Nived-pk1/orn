// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { tierState } from '@/test-support/perf-kit';
import { fakeApp, planOf, renderWithApp, stubDialog, type FakeApp } from '@/test-support/window-kit';
import { unavailableReason } from './dataset-actions';

beforeAll(stubDialog);
afterEach(cleanup);

const APPLIED = { ok: true, revision: 2, snapshotId: 's', report: {}, reportSaved: true, saved: true, sessionOnly: false, save: null, inProcess: false, notes: [] };
const button = (name: string): HTMLElement => screen.getByRole('button', { name });

function withData(options: Parameters<typeof fakeApp>[0] = {}): FakeApp {
  const a = fakeApp({ state: tierState('tiny', 'dense'), ...options });
  a.flows.preview.mockResolvedValue({ ok: true, plan: planOf(), inProcess: false });
  a.flows.apply.mockResolvedValue(APPLIED);
  return a;
}
const openDataset = (): HTMLElement => {
  fireEvent.click(button('Dataset'));
  return screen.getByRole('region', { name: 'Replace the data' });
};

describe('Replace with the demo dataset (Dataset mode)', () => {
  it('asks first, in words; Cancel changes nothing', () => {
    const a = withData();
    renderWithApp(a);
    fireEvent.click(within(openDataset()).getByRole('button', { name: 'Replace with the demo dataset' }));
    expect(screen.getByText(/The current data is replaced by the bundled demo dataset\. Undo import brings the current data back/)).toBeTruthy();
    fireEvent.click(button('Cancel'));
    expect(a.loadDemo).not.toHaveBeenCalled();
    expect(a.flows.preview).not.toHaveBeenCalled();
  });

  it('Replace imports the demo with replace_all through the normal pipeline and says so', async () => {
    const a = withData();
    renderWithApp(a);
    fireEvent.click(within(openDataset()).getByRole('button', { name: 'Replace with the demo dataset' }));
    fireEvent.click(button('Replace'));
    await screen.findByText('Imported 5 records from demo.orn.json.');
    expect(a.flows.preview.mock.calls[0]?.[2]).toEqual({ mode: 'replace_all' });
    expect(a.flows.apply).toHaveBeenCalledTimes(1);
  });

  it('Undo import restores the snapshot of the newest import and says so; a refusal is plain text', async () => {
    const a = withData();
    a.flows.undo.mockResolvedValueOnce({ ...APPLIED, notes: [] }).mockResolvedValueOnce({ ok: false, code: 'UNKNOWN_BATCH', message: 'there is no import to undo' });
    renderWithApp(a);
    const region = openDataset();
    fireEvent.click(within(region).getByRole('button', { name: 'Undo import' }));
    await screen.findByText(/^Import undone: the data from before it is back\. That was the import of earlier\.orn\.json; the dataset holds \d+ records again\./);
    fireEvent.click(within(screen.getByRole('region', { name: 'Replace the data' })).getByRole('button', { name: 'Undo import' }));
    await screen.findByText('Undo import: there is no import to undo.');
  });

  it('read-only, follower and session-only tabs get both buttons unavailable, with the reason', () => {
    for (const [mode, reason] of [['read_only', 'another version is open'], ['follower', null], ['session_only', null]] as const) {
      const a = withData({ status: { mode, reason } });
      renderWithApp(a);
      const region = openDataset();
      for (const name of ['Replace with the demo dataset', 'Undo import']) {
        const b = within(region).getByRole('button', { name });
        expect(b.getAttribute('aria-disabled')).toBe('true');
        fireEvent.click(b);
      }
      expect(a.loadDemo).not.toHaveBeenCalled();
      expect(a.flows.undo).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it('the reasons are words', () => {
    expect(unavailableReason('writer', null)).toBeUndefined();
    expect(unavailableReason('read_only', 'x')).toBe('x');
    expect(unavailableReason('follower', null)).toMatch(/another tab/);
    expect(unavailableReason('session_only', null)).toMatch(/nothing is saved/);
    expect(unavailableReason(null, null)).toMatch(/starting/);
  });
});
