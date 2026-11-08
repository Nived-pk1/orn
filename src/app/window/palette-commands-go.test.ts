import { describe, expect, it } from 'vitest';
import { createNavigatorUiStores } from '@/ui/state';
import { buildCommands, type CommandDeps } from './palette-commands';

function deps(over: Partial<CommandDeps> = {}): { deps: CommandDeps; modes: string[]; exported: number[] } {
  const modes: string[] = [];
  const exported: number[] = [];
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
    openExport: () => void exported.push(1),
    ui: createNavigatorUiStores(),
    exams: { options: [] } as never,
    ...over,
  };
  return { deps: base, modes, exported };
}

describe('"Go to <view>" and "Back up your data" in the palette (step 8.4d, C7)', () => {
  it('every view of the rail has a "Go to" command, and they are the ones the empty palette suggests', () => {
    const { deps: d } = deps({ views: [{ id: 'dataset', label: 'Dataset' }, { id: 'workbench', label: 'Workbench' }, { id: 'review', label: 'Review' }] });
    const commands = buildCommands(d);
    const titles = commands.filter((c) => c.title.startsWith('Go to ')).map((c) => c.title);
    expect(titles).toEqual(['Go to Chapters', 'Go to Map', 'Go to Reactions', 'Go to Precursors', 'Go to Reagents', 'Go to Named reactions', 'Go to Mechanisms', 'Go to Syllabus', 'Go to Dataset', 'Go to Workbench', 'Go to Review']);
    expect(commands.filter((c) => c.suggest === true).map((c) => c.title)).toEqual([...titles, 'Back up your data']);
  });

  it('"Go to Map" shows the map and closes an open family page', () => {
    const { deps: d, modes } = deps({ mode: 'reactions' });
    d.ui.family.getState().openFamily('class_a');
    buildCommands(d).find((c) => c.title === 'Go to Map')?.run();
    expect(modes).toEqual(['navigator']);
    expect(d.ui.family.getState().open).toBeNull();
  });

  it('a view of the rail with no entry of its own opens through setMode', () => {
    const { deps: d, modes } = deps({ views: [{ id: 'review', label: 'Review' }] });
    const command = buildCommands(d).find((c) => c.title === 'Go to Review');
    expect(command?.unavailable).toBeUndefined();
    command?.run();
    expect(modes).toEqual(['review']);
  });

  it('"Back up your data" opens the export screen and is still found by "export"', () => {
    const { deps: d, exported } = deps();
    const command = buildCommands(d).find((c) => c.title === 'Back up your data');
    expect(command?.keywords).toContain('export');
    command?.run();
    expect(exported).toEqual([1]);
    expect(buildCommands(d).some((c) => c.title === 'Export...')).toBe(false);
  });

  it('with no data the data views are listed with their reason, never hidden', () => {
    const { deps: d } = deps({ hasData: false });
    const go = buildCommands(d).find((c) => c.title === 'Go to Reactions');
    expect(go?.unavailable).toBe('there is no data');
  });
});
