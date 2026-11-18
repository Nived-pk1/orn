import { describe, expect, it, vi } from 'vitest';
import { createNavigatorUiStores } from '@/ui/state';
import { buildCommands, type CommandDeps } from './palette-commands';

const base = (over: Partial<CommandDeps> = {}): CommandDeps => ({
  mode: 'navigator',
  setMode: () => undefined,
  hasData: true,
  writerMode: 'writable',
  writerReason: null,
  importReason: undefined,
  askReplace: () => undefined,
  undoImport: () => undefined,
  pickFile: () => undefined,
  openExport: () => undefined,
  ui: createNavigatorUiStores(),
  exams: { options: [] } as never,
  ...over,
});

describe('palette commands for starred records and shortcuts (step 8.4g Part B, G2 and G5)', () => {
  it('"Star for revision" runs the star; "Remove star" when the record is starred; unavailable with a reason when nothing is selected', () => {
    const run = vi.fn();
    const on = buildCommands(base({ star: { starred: false, run } })).find((c) => c.id === 'star');
    expect(on?.title).toBe('Star for revision');
    expect(on?.unavailable).toBeUndefined();
    on?.run();
    expect(run).toHaveBeenCalledTimes(1);
    expect(buildCommands(base({ star: { starred: true, run } })).find((c) => c.id === 'star')?.title).toBe('Remove star');
    const none = buildCommands(base({ star: { starred: false, run: undefined } })).find((c) => c.id === 'star');
    expect(none?.unavailable).toBe('no record is selected');
  });

  it('there is no star command in a window that keeps no stars', () => {
    expect(buildCommands(base()).find((c) => c.id === 'star')).toBeUndefined();
  });

  it('"Show keyboard shortcuts" opens the sheet', () => {
    const open = vi.fn();
    const command = buildCommands(base({ showShortcuts: open })).find((c) => c.id === 'shortcuts');
    expect(command?.title).toBe('Show keyboard shortcuts');
    command?.run();
    expect(open).toHaveBeenCalledTimes(1);
  });
});
