import { describe, expect, it, vi } from 'vitest';
import { createNavigatorUiStores } from '@/ui/state';
import type { CanonicalState } from '@/core/schema';
import { placementsOf } from './placement-commands';
import { buildCommands, type CommandDeps } from './palette-commands';

const state = {
  records: {
    species: { spc_1: { kind: 'species', id: 'spc_1', names: { canonical: 'Ethanol' } } },
    reaction: { rxn_1: { kind: 'reaction', id: 'rxn_1', name: 'Aldol → addition' } },
    topic: { top_1: { kind: 'topic', id: 'top_1', name: 'Alcohols and phenols' } },
    topic_mapping: {
      tmp_1: { kind: 'topic_mapping', id: 'tmp_1', topicId: 'top_1', target: { kind: 'species', id: 'spc_1' } },
      tmp_2: { kind: 'topic_mapping', id: 'tmp_2', topicId: 'top_1', target: { kind: 'reaction', id: 'rxn_1' } },
      tmp_3: { kind: 'topic_mapping', id: 'tmp_3', topicId: 'top_gone', target: { kind: 'species', id: 'spc_gone' } },
    },
  },
} as unknown as CanonicalState;

describe('topic placements in the palette (step 8.4g, G9)', () => {
  it('names each placement "<record name> in <topic name>" and falls back to the ids for what is gone', () => {
    expect(placementsOf(state)).toEqual([
      { id: 'tmp_1', title: 'Ethanol in Alcohols and phenols' },
      { id: 'tmp_2', title: 'Aldol → addition in Alcohols and phenols' },
      { id: 'tmp_3', title: 'spc_gone in top_gone' },
    ]);
  });

  it('is made once for one state', () => {
    expect(placementsOf(state)).toBe(placementsOf(state));
  });

  it('the palette lists them as commands that open the placement record', () => {
    const open = vi.fn();
    const deps: CommandDeps = {
      mode: 'navigator', setMode: () => undefined, hasData: true, writerMode: 'writable', writerReason: null, importReason: undefined,
      askReplace: () => undefined, undoImport: () => undefined, pickFile: () => undefined, openExport: () => undefined,
      ui: createNavigatorUiStores(), exams: { options: [] } as never,
      state: () => state, openPlacement: open,
    };
    const command = buildCommands(deps).find((one) => one.title === 'Ethanol in Alcohols and phenols');
    expect(command?.unavailable).toBeUndefined();
    command?.run();
    expect(open).toHaveBeenCalledWith('tmp_1');
  });
});
