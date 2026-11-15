// @vitest-environment jsdom
/** The Studio status line says how old the last backup is (step 8.4s, S4); the words come from backup-rule.ts, the marks from the record. */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeApp } from '@/test-support/window-kit';
import { AppProvider } from './context';
import { createBackupRecord } from './backup-record';
import { FullStatusLine } from './full-status';

afterEach(cleanup);

const NOW = 1_790_000_000_000; // the injected clock of the fake app
const DAY = 24 * 60 * 60 * 1000;

function show(uiState: Record<string, unknown>) {
  const app = fakeApp();
  const backup = createBackupRecord({ bootReport: { uiState } as never }, () => NOW);
  render(
    <AppProvider value={{ ...app.value, backup }}>
      <FullStatusLine />
    </AppProvider>,
  );
  return { app, backup };
}
const line = (): string => screen.getByRole('button', { name: 'Status details' }).textContent ?? '';

describe('the status line and the backup', () => {
  it('says "No backup yet" with no backup', () => {
    show({});
    expect(line()).toContain('No backup yet');
  });
  it('says how long ago and how many changes since', () => {
    show({ lastBackup: { revision: 0, at: new Date(NOW - 2 * DAY).toISOString() } });
    expect(line()).toContain('Backed up 2 days ago, no changes since');
  });
  it('a finished backup changes the words at once', () => {
    const { backup } = show({});
    act(() => backup.markBackedUp(0));
    expect(line()).toContain('Backed up just now, no changes since');
  });
});
