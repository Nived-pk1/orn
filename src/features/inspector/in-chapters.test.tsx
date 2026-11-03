// @vitest-environment jsdom
/** "In chapters: <links>" under the title of a study record (7.3b D4). */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
import { loadOtherViews } from './lazy-views';

// the line is a lazy chunk (7.3c A1): load it once, so every show() settles in one act
beforeAll(async () => {
  await import('./in-chapters');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stateOf(...records: readonly AnyRecord[]): CanonicalState {
  const tables = emptyRecordTables() as unknown as Record<string, Record<string, AnyRecord>>;
  for (const record of records) (tables[record.kind] as Record<string, AnyRecord>)[record.id] = record;
  return { meta: demoState().meta, records: tables as unknown as CanonicalState['records'] };
}

async function show(state: CanonicalState, ref: { kind: string; id: string }, host: Partial<InspectorHost> = {}): Promise<void> {
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
  await act(async () => inspector.getState().open(ref as never));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); // 8.1: the layout comes from the views chunk
}

const base = [topic('subj', 'Organic', { kind: 'subject', order: 1 }), topic('chap-a', 'Alpha chapter', { kind: 'chapter', parent: 'subj', order: 1 }), topic('chap-b', 'Bravo chapter', { kind: 'chapter', parent: 'subj', order: 2 })];

beforeAll(async () => {
  await loadOtherViews();
});

describe('In chapters', () => {
  it('names the chapters of the record as links that open the chapter page', async () => {
    const opened: string[] = [];
    await show(stateOf(...base, concept('c1', 'One', 'general'), topicMapping('m1', 'chap-a', { kind: 'concept', id: 'cpt_c1' } as never), topicMapping('m2', 'chap-b', { kind: 'concept', id: 'cpt_c1' } as never, 'supporting')), { kind: 'concept', id: 'cpt_c1' }, { openChapter: (id) => void opened.push(id) });
    const line = document.querySelector('[data-in-chapters]') as HTMLElement;
    expect(line.textContent).toBe('In the syllabusAlpha chapterBravo chapter');
    fireEvent.click(screen.getByRole('button', { name: 'Bravo chapter' }));
    expect(opened).toEqual(['top_chap-b']);
  });

  it('Studio (an editor is wired): a study record in no chapter says so; a topic has no such line', async () => {
    await show(stateOf(...base, concept('c1', 'One', 'general')), { kind: 'concept', id: 'cpt_c1' }, { editNames: { unavailable: undefined, open: () => undefined } });
    expect((document.querySelector('[data-in-chapters]') as HTMLElement).textContent).toBe('In the syllabusNo chapter yet');
    cleanup();
    await show(stateOf(...base), { kind: 'topic', id: 'top_chap-a' });
    expect(document.querySelector('[data-in-chapters]')).toBeNull();
  });

  it('Study (no editor): a study record in no chapter has no "In chapters" line at all (7.6 A1)', async () => {
    await show(stateOf(...base, concept('c1', 'One', 'general')), { kind: 'concept', id: 'cpt_c1' });
    expect(document.querySelector('[data-in-chapters]')).toBeNull();
  });
});

describe('where the line sits (phone peek, 7.3b)', () => {
  const rec = [...base, concept('c1', 'One', 'general'), topicMapping('m1', 'chap-a', { kind: 'concept', id: 'cpt_c1' } as never)];
  it('on a phone it is in the FULL part of the sheet, hidden at peek, so the peek keeps its height', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    await show(stateOf(...rec), { kind: 'concept', id: 'cpt_c1' });
    expect((document.querySelector('[data-in-chapters]') as HTMLElement).closest('[data-sheet-full]')).not.toBeNull();
  });
  it('on a desktop it stays under the title, outside the full part', async () => {
    await show(stateOf(...rec), { kind: 'concept', id: 'cpt_c1' });
    expect((document.querySelector('[data-in-chapters]') as HTMLElement).closest('[data-sheet-full]')).toBeNull();
  });
});
