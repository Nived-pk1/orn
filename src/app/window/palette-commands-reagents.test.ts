import { describe, expect, it } from 'vitest';
import { createNavigatorUiStores } from '@/ui/state';
import { buildCommands, type CommandDeps } from './palette-commands';

function deps(over: Partial<CommandDeps> = {}): { deps: CommandDeps; modes: string[] } {
  const modes: string[] = [];
  const base: CommandDeps = {
    mode: 'navigator',
    setMode: (mode) => void modes.push(mode),
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
  };
  return { deps: base, modes };
}

describe('the "Open Reagents" command (7.3c D4)', () => {
  it('opens the Reagents mode as it was left and remembers the explorer', () => {
    const { deps: d, modes } = deps();
    const command = buildCommands(d).find((c) => c.id === 'open-reagents');
    expect(command?.title).toBe('Open Reagents');
    expect(command?.unavailable).toBeUndefined();
    command?.run();
    expect(modes).toEqual(['reagents']);
    expect(d.ui.explorer.getState().last).toBe('reagents');
  });

  it('is listed with its reason when there is no data', () => {
    const { deps: d } = deps({ hasData: false });
    expect(buildCommands(d).find((c) => c.id === 'open-reagents')?.unavailable).toBe('there is no data');
  });
});
