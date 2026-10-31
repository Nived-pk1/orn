// @vitest-environment jsdom
/**
 * The Review page grouped by Import (the default), Chapter or Kind (7.3a E1, E2; 7.3b A1, A2) over the demo: the "Group by" choice (kept
 * through the port, tolerant), group headings with counts, a record in several chapters listed in each, "No chapter yet" last, filter
 * options with counts, "Clear all filters", and on a phone the filters behind "Filters (n)".
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { produce } from 'immer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeStore } from '../../test-support/command-kit';
import { demoState } from '@/test-support/app-boot-kit';
import { stubDialog } from '@/test-support/window-kit';
import type { GroupBy, ImportLine } from '@/core/editing';
import type { CanonicalState } from '@/core/schema';
import { PHONE_QUERIES } from '@/ui/hooks';
import { ToastProvider } from '@/ui/primitives';
import type { ReviewPort } from './contracts';
import { ReviewPage } from './review-page';

// jsdom does no layout: the list's scroll area is made tall and every other element short, so the list renders every item
const isScroller = (el: Element): boolean => el.hasAttribute('data-virtual-list');
beforeAll(() => {
  stubDialog();
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return isScroller(this) ? 200_000 : 40; } });
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const height = isScroller(this) ? 200_000 : 40;
    return { x: 0, y: 0, top: 0, left: 0, right: 800, bottom: height, width: 800, height, toJSON: () => ({}) };
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const LOG: readonly ImportLine[] = [{ id: 'imp_new', fileName: 'second.orn.json', appliedAt: '2026-10-02T10:00:00.000Z' }];
const PCC = 'rxn_alcohol1-to-aldehyde-pcc';

/** The demo with the PCC reaction written by the import `imp_new`. */
const stampedDemo = (): CanonicalState =>
  produce(demoState(), (draft) => {
    (draft.records.reaction[PCC] as { provenance: { importBatchId?: string } }).provenance.importBatchId = 'imp_new';
  });

function show(initial?: GroupBy, over: { readonly state?: CanonicalState; readonly log?: readonly ImportLine[] } = {}) {
  const store = makeStore(over.state ?? demoState());
  const save = vi.fn<(value: GroupBy) => void>();
  const port: ReviewPort = {
    state: store.getState,
    findingsOf: () => [],
    subscribe: (listener) => store.subscribe(listener),
    now: () => '2026-10-30T12:00:00.000Z',
    dispatch: () => ({ ok: true }),
    unavailable: undefined,
    open: vi.fn(),
    editReason: () => undefined,
    edit: vi.fn(),
    imports: { log: over.log ?? [], formatTime: (iso: string) => `on ${iso.slice(0, 10)}` },
    ...(initial === undefined ? {} : { grouping: { initial, save } }),
  };
  render(
    <ToastProvider>
      <ReviewPage port={port} />
    </ToastProvider>,
  );
  return { save };
}
const headings = (): string[] => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent ?? '');

describe('Group by', () => {
  it('offers Import, Chapter and Kind; Import is the default', () => {
    show();
    const group = screen.getByRole('radiogroup', { name: 'Group by' });
    expect(within(group).getAllByRole('radio').map((r) => (r as HTMLInputElement).labels?.[0]?.textContent)).toEqual(['Import', 'Chapter', 'Kind']);
    expect((within(group).getByRole('radio', { name: 'Import' }) as HTMLInputElement).checked).toBe(true);
    expect(headings()).toEqual([expect.stringMatching(/^Demo data · \d+ records$/)]);
  });

  it('by import: a record with a known batch id is under "<file> · imported <time> · n records", then Demo data', () => {
    show('import', { state: stampedDemo(), log: LOG });
    const found = headings();
    expect(found[0]).toBe('second.orn.json · imported on 2026-10-02 · 1 record');
    expect(found[1]).toMatch(/^Demo data · \d+ records$/);
  });

  it('the Import filter lists each import with its count and narrows the list', () => {
    show('kind', { state: stampedDemo(), log: LOG });
    const select = screen.getByRole('combobox', { name: 'Import' }) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toContain('second.orn.json · imported on 2026-10-02 (1)');
    fireEvent.change(select, { target: { value: 'imp_new' } });
    expect(screen.getByText(/^1 of \d+ records shown$/)).toBeTruthy();
  });

  it('choosing Chapter regroups and tells the port to keep the choice; the heading is the chapter topic (no exam version)', () => {
    const { save } = show('kind');
    expect(headings().some((h) => /^reaction \(\d+\)$/.test(h))).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Chapter' }));
    expect(save).toHaveBeenCalledWith('chapter');
    const found = headings();
    expect(found.some((h) => h.startsWith('Alcohols, phenols and ethers ('))).toBe(true);
    expect(found.some((h) => h.includes('JEE'))).toBe(false);
    expect(found.at(-1)).toMatch(/^No chapter yet \(\d+\)$/);
  });

  it('a saved Chapter opens grouped by chapter', () => {
    show('chapter');
    expect(headings().at(-1)).toMatch(/^No chapter yet/);
    expect((screen.getByRole('radio', { name: 'Chapter' }) as HTMLInputElement).checked).toBe(true);
  });

  it('a record is listed ONCE in its chapter (no longer once per exam version)', () => {
    show('chapter');
    expect(screen.getAllByText('1° alcohol → aldehyde (PCC)')).toHaveLength(1);
  });

  it('a record mapped into two chapters is listed under each', () => {
    const state = produce(demoState(), (draft) => {
      const any = Object.values(draft.records.topic_mapping)[0] as unknown as Record<string, unknown>;
      (draft.records.topic_mapping as Record<string, unknown>).tmp_second = { ...any, id: 'tmp_second', topicId: 'top_hydrocarbons', target: { kind: 'reaction', id: PCC } };
    });
    show('chapter', { state });
    expect(screen.getAllByText('1° alcohol → aldehyde (PCC)')).toHaveLength(2);
  });
});

describe('filters', () => {
  it('Chapter and Kind options carry counts; choosing a chapter narrows the list; Clear all filters brings it back', () => {
    show('chapter');
    const chapter = screen.getByRole('combobox', { name: 'Chapter' }) as HTMLSelectElement;
    const option = [...chapter.options].find((o) => o.textContent?.startsWith('Alcohols, phenols and ethers ('));
    expect(option).toBeTruthy();
    fireEvent.change(chapter, { target: { value: option?.value ?? '' } });
    expect(headings()).toHaveLength(1);
    expect(screen.getByText(/records shown/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(headings().length).toBeGreaterThan(1);
  });

  it('Clear all filters is only offered while a filter is set', () => {
    show('kind');
    expect(screen.queryByRole('button', { name: 'Clear all filters' })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Kind' }), { target: { value: 'reaction' } });
    expect(screen.getByRole('button', { name: 'Clear all filters' })).toBeTruthy();
  });
});

describe('on a phone', () => {
  it('the filters are behind "Filters (n)", n counting the ones set', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    show();
    const button = screen.getByRole('button', { name: 'Filters (0)' });
    fireEvent.click(button);
    fireEvent.change(screen.getByRole('combobox', { name: 'Kind' }), { target: { value: 'reaction' } });
    expect(screen.getByRole('button', { name: 'Filters (1)' })).toBeTruthy();
  });
});
