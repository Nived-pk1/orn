// @vitest-environment jsdom
/**
 * Step 8.5 M4/M5 in the Mechanisms view (ADR-038 D4): every step KIND renders its kind words and, with a fixture step, its drawing; the
 * step's rows are "Step details" collapsed below the drawing and open when there is none; a long mechanism draws lazily; without the drawing
 * port the steps are rows exactly as before.
 */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyRecordTables, STEP_KINDS, type AnyRecord, type CanonicalState } from '@/core/schema';
import type { StepDrawingPort } from '@/render/mechanism';
import { demoState } from '@/test-support/app-boot-kit';
import { contextOf } from '@/test-support/graph-state';
import { mechanismRecord, mechStep, mechVariant } from '@/test-support/named-kit';
import { createActiveExamStore, createInspectorStore, createPageListStore } from '@/ui/state';
import type { MechanismPorts } from './contracts';
import { MechanismsView } from './mechanisms-view';

afterEach(cleanup);

function stateOf(...records: readonly AnyRecord[]): CanonicalState {
  const tables = emptyRecordTables() as unknown as Record<string, Record<string, AnyRecord>>;
  for (const record of records) (tables[record.kind] as Record<string, AnyRecord>)[record.id] = record;
  return { meta: demoState().meta, records: tables as unknown as CanonicalState['records'] };
}

const drawingPort = (maps: readonly number[] = [1, 2]): StepDrawingPort => ({
  depict: async () => ({ ok: true, svg: '<svg/>', width: 100, height: 60, atoms: maps.map((map, i) => ({ map, x: 20 + 40 * i, y: 30, rx: 9, ry: 9 })), bonds: [] }),
  createUrl: () => 'blob:x',
  revokeUrl: () => undefined,
});

const structured = (id: string, kinds: readonly (typeof STEP_KINDS)[number][], over: { title?: string } = {}) =>
  mechStep(id, {
    title: over.title ?? `Title of ${id}`,
    kinds: [...kinds],
    description: 'Details are here.',
    species: [{ role: 'reactant', structure: { format: 'smiles', value: '[CH3:1][OH:2]' } }, { role: 'product', label: 'Product' }],
    movements: [{ from: { kind: 'lone_pair', atom: 2 }, to: { kind: 'bond', atoms: [1, 2] }, electrons: 2 }],
  });

function show(mechanism: AnyRecord, extra: Partial<MechanismPorts> = {}) {
  const state = stateOf(mechanism);
  const context = contextOf(state);
  const ports: MechanismPorts = {
    store: { getState: () => state, subscribe: () => () => undefined },
    indexes: { current: () => context.indexes },
    ui: { mechanisms: createPageListStore({ openId: mechanism.id }), exam: createActiveExamStore(), inspector: createInspectorStore() },
    renderCard: () => null,
    renderRichText: (source) => <p>{source}</p>,
    renderPictures: () => null,
    renderStructure: (structure, name) => <span data-drawing={name}>{structure.value}</span>,
    select: () => undefined,
    selectReaction: () => undefined,
    openChapter: () => undefined,
    timers: { after: () => () => undefined },
    log: () => undefined,
    ...extra,
  };
  render(<MechanismsView ports={ports} />);
}

describe('every step kind (table-driven over STEP_KINDS)', () => {
  it.each(STEP_KINDS)('%s: the kind words and, with a fixture step, the drawing', async (kind) => {
    show(mechanismRecord('kinds', 'Kinds', [mechVariant('vee', 'V', [structured('one', [kind])])]), { drawing: drawingPort() });
    const step = document.querySelector('[data-step="1"]') as HTMLElement;
    expect(within(step).getByText(kind.replaceAll('_', ' '))).toBeTruthy();
    expect(await within(step).findByRole('img', { name: 'Drawing of step 1; the details are below.' })).toBeTruthy();
  });
});

describe('the step layout', () => {
  it('the drawing comes first and the rows are "Step details" collapsed below it', async () => {
    show(mechanismRecord('layout', 'Layout', [mechVariant('vee', 'V', [structured('one', ['proton_transfer'])])]), { drawing: drawingPort() });
    const step = document.querySelector('[data-step="1"]') as HTMLElement;
    const img = await within(step).findByRole('img');
    const details = step.querySelector('details') as HTMLDetailsElement;
    await waitFor(() => expect(details.open).toBe(false));
    expect(details.querySelector('summary')?.textContent).toBe('Step details');
    expect(img.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(details.textContent).toContain('Details are here.');
  });

  it('the details are open when there is no drawing (a step with no atom maps says why, and its rows are right there)', async () => {
    show(mechanismRecord('nomaps', 'No maps', [mechVariant('vee', 'V', [mechStep('one', { title: 'T', kinds: ['other'], description: 'Rows only.', species: [{ role: 'reactant', label: 'Ethanal' }] })])]), { drawing: drawingPort() });
    const step = document.querySelector('[data-step="1"]') as HTMLElement;
    expect(await within(step).findByText('No drawing: this step has no atom-mapped structures.')).toBeTruthy();
    expect((step.querySelector('details') as HTMLDetailsElement).open).toBe(true);
    expect(within(step).queryByRole('img')).toBeNull();
  });

  it('"slow step" and "reversible" stay as quiet marks above the drawing', async () => {
    show(mechanismRecord('marks', 'Marks', [mechVariant('vee', 'V', [mechStep('one', { title: 'T', kinds: ['other'], rds: true, reversible: true })])]), { drawing: drawingPort() });
    const step = document.querySelector('[data-step="1"]') as HTMLElement;
    expect(within(step).getByText('slow step')).toBeTruthy();
    expect(within(step).getByText('⇌ reversible')).toBeTruthy();
  });

  it('without the drawing port the steps are rows only, with no "Step details" fold', () => {
    show(mechanismRecord('plain', 'Plain', [mechVariant('vee', 'V', [structured('one', ['other'])])]));
    expect(document.querySelector('details')).toBeNull();
    expect(screen.getByText('Details are here.')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('a mechanism with more than 6 steps draws a step only when it comes near the screen', async () => {
    const seen: string[] = [];
    class Observer {
      constructor(readonly cb: (entries: { isIntersecting: boolean }[]) => void) {}
      observe(): void {
        seen.push('observe');
      }
      disconnect(): void {}
    }
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = Observer;
    try {
      const steps = Array.from({ length: 7 }, (_, i) => structured(`s${i}`, ['other']));
      show(mechanismRecord('long', 'Long', [mechVariant('vee', 'V', steps)]), { drawing: drawingPort() });
      expect(seen.length).toBe(7);
      expect(screen.queryByRole('img')).toBeNull();
      expect(screen.getAllByText(/^Drawing step \d…$/).length).toBe(7);
    } finally {
      delete (globalThis as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
    }
  });
});
