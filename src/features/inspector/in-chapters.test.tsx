// @vitest-environment jsdom
/** "In chapters: <links>" under the title of a study record (7.3b D4). */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDerivedIndexes } from '@/app/services/derived-indexes';
import { createCanonicalStore } from '@/core/commands';
import { emptyRecordTables, type AnyRecord, type CanonicalState } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { topic, topicMapping } from '@/test-support/curriculum-kit';
import { concept } from '@/test-support/graph-state';
import { manualTimers } from '@/test-support/navigator-kit';
import { PHONE_QUERIES } from '@/ui/hooks';
import { createFamilyStore, createInspectorStore, createPanelsStore, createSelectionStore } from '@/ui/state';
import type { InspectorHost, InspectorPorts } from './contracts';
import { Inspector } from './inspector';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stateOf(...records: readonly AnyRecord[]): CanonicalState {
  const tables = emptyRecordTables() as unknown as Record<string, Record<string, AnyRecord>>;
  for (const record of records) (tables[record.kind] as Record<string, AnyRecord>)[record.id] = record;
  return { meta: demoState().meta, records: tables as unknown as CanonicalState['records'] };
}

function show(state: CanonicalState, ref: { kind: string; id: string }, host: Partial<InspectorHost> = {}): void {
  const store = createCanonicalStore({ initial: state, revision: 0, validateInitial: false });
  const indexes = createDerivedIndexes({ store, clock: { nowMs: () => 0 } });
  const inspector = createInspectorStore();
  const panels = createPanelsStore({ stored: undefined, mode: () => 'writable', save: () => Promise.resolve() }, { after: () => () => undefined });
  const ports: InspectorPorts = {
    store,
    indexes: { current: () => indexes.current() },
    findings: store.findings,
    l4: { statusOf: () => ({ state: 'none' }), derivedFormulaOf: () => undefined, subscribe: () => () => undefined, subscribeFormulas: () => () => undefined },
    timers: manualTimers(),
    ui: { inspector, selection: createSelectionStore(), family: createFamilyStore(), panels },
    log: () => undefined,
  };
  render(<Inspector ports={ports} host={{ openPane: () => undefined, edgeEnds: () => undefined, navigatorShown: false, ...host }} />);
  act(() => inspector.getState().open(ref as never));
}

const base = [topic('subj', 'Organic', { kind: 'subject', order: 1 }), topic('chap-a', 'Alpha chapter', { kind: 'chapter', parent: 'subj', order: 1 }), topic('chap-b', 'Bravo chapter', { kind: 'chapter', parent: 'subj', order: 2 })];

describe('In chapters', () => {
  it('names the chapters of the record as links that open the chapter page', () => {
    const opened: string[] = [];
    show(stateOf(...base, concept('c1', 'One', 'general'), topicMapping('m1', 'chap-a', { kind: 'concept', id: 'cpt_c1' } as never), topicMapping('m2', 'chap-b', { kind: 'concept', id: 'cpt_c1' } as never, 'supporting')), { kind: 'concept', id: 'cpt_c1' }, { openChapter: (id) => void opened.push(id) });
    const line = document.querySelector('[data-in-chapters]') as HTMLElement;
    expect(line.textContent).toBe('In chapters: Alpha chapter, Bravo chapter');
    fireEvent.click(screen.getByRole('button', { name: 'Bravo chapter' }));
    expect(opened).toEqual(['top_chap-b']);
  });

  it('a study record in no chapter says so; a topic has no such line', () => {
    show(stateOf(...base, concept('c1', 'One', 'general')), { kind: 'concept', id: 'cpt_c1' });
    expect((document.querySelector('[data-in-chapters]') as HTMLElement).textContent).toBe('In chapters: No chapter yet');
    cleanup();
    show(stateOf(...base), { kind: 'topic', id: 'top_chap-a' });
    expect(document.querySelector('[data-in-chapters]')).toBeNull();
  });
});

describe('where the line sits (phone peek, 7.3b)', () => {
  const rec = [...base, concept('c1', 'One', 'general'), topicMapping('m1', 'chap-a', { kind: 'concept', id: 'cpt_c1' } as never)];
  it('on a phone it is in the FULL part of the sheet, hidden at peek, so the peek keeps its height', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    show(stateOf(...rec), { kind: 'concept', id: 'cpt_c1' });
    expect((document.querySelector('[data-in-chapters]') as HTMLElement).closest('[data-sheet-full]')).not.toBeNull();
  });
  it('on a desktop it stays under the title, outside the full part', () => {
    show(stateOf(...rec), { kind: 'concept', id: 'cpt_c1' });
    expect((document.querySelector('[data-in-chapters]') as HTMLElement).closest('[data-sheet-full]')).toBeNull();
  });
});
