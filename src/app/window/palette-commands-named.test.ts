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
  ['open-named', 'Go to Named reactions', 'named'],
  ['open-mechanisms', 'Go to Mechanisms', 'mechanisms'],
  ['open-syllabus', 'Go to Syllabus', 'syllabus'],
] as const)('the "%s" command (7.4)', (id, title, mode) => {
  it('opens the mode as it was left and remembers the explorer', () => {
    const { deps: d, modes } = deps();
    const command = buildCommands(d).find((c) => c.id === id);
    expect(command?.title).toBe(title);
    expect(command?.unavailable).toBeUndefined();
    command?.run();
    expect(modes).toEqual([mode]);
    expect(d.ui.explorer.getState().last).toBe(mode);
  });
  it('is listed with its reason when there is no data', () => {
    const { deps: d } = deps({ hasData: false });
    expect(buildCommands(d).find((c) => c.id === id)?.unavailable).toBe('there is no data');
  });
});
