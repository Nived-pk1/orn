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

describe.each([
  ['open-chapters', 'Go to Chapters', 'chapters'],
  ['open-reactions', 'Go to Reactions', 'reactions'],
  ['open-precursors', 'Go to Precursors', 'precursors'],
] as const)('the "%s" command (8.1 RR3)', (id, title, mode) => {
  it('opens the mode and closes an open family page', () => {
    const { deps: d, modes } = deps();
    
    const command = buildCommands(d).find((c) => c.id === id);
    expect(command?.title).toBe(title);
    expect(command?.unavailable).toBeUndefined();
    command?.run();
    expect(modes).toEqual([mode]);
  });
  it('remembers the explorer (Reactions, Precursors) or the phone tab (Chapters)', () => {
    const { deps: d } = deps();
    buildCommands(d).find((c) => c.id === id)?.run();
    if (mode === 'chapters') expect(d.ui.overview.getState().phoneTab).toBe('chapters');
    else expect(d.ui.explorer.getState().last).toBe(mode);
  });
  it('is listed with its reason when there is no data', () => {
    const { deps: d } = deps({ hasData: false });
    expect(buildCommands(d).find((c) => c.id === id)?.unavailable).toBe('there is no data');
  });
});
