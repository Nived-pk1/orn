// @vitest-environment jsdom
/**
 * The Review page grouped by Chapter or by Kind (7.3a E1, E2) over the demo: the "Group by" choice (kept through the port, tolerant), group
 * headings with counts, a record in several chapters listed in each, "No chapter yet" last, filter options with counts, "Clear all
 * filters", and on a phone the filters behind "Filters (n)". There is no grouping by import (E3). Written first (seen red).
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeStore } from '../../test-support/command-kit';
import { demoState } from '@/test-support/app-boot-kit';
import { stubDialog } from '@/test-support/window-kit';
import type { GroupBy } from '@/core/editing';
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

function show(initial?: GroupBy) {
  const store = makeStore(demoState());
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
  it('offers Chapter and Kind; Kind is the default (today\'s page), and there is no Import choice', () => {
    show();
    const group = screen.getByRole('radiogroup', { name: 'Group by' });
    expect(within(group).getAllByRole('radio').map((r) => (r as HTMLInputElement).labels?.[0]?.textContent)).toEqual(['Chapter', 'Kind']);
    expect((within(group).getByRole('radio', { name: 'Kind' }) as HTMLInputElement).checked).toBe(true);
    expect(headings().some((h) => /^reaction \(\d+\)$/.test(h))).toBe(true);
  });

  it('choosing Chapter regroups and tells the port to keep the choice', () => {
    const { save } = show('kind');
    fireEvent.click(screen.getByRole('radio', { name: 'Chapter' }));
    expect(save).toHaveBeenCalledWith('chapter');
    const found = headings();
    expect(found.some((h) => h.startsWith('JEE Advanced 2026 (provisional) › Alcohols, phenols and ethers ('))).toBe(true);
    expect(found.at(-1)).toMatch(/^No chapter yet \(\d+\)$/);
  });

  it('a saved Chapter opens grouped by chapter', () => {
    show('chapter');
    expect(headings().at(-1)).toMatch(/^No chapter yet/);
    expect((screen.getByRole('radio', { name: 'Chapter' }) as HTMLInputElement).checked).toBe(true);
  });

  it('a record in two chapters is listed under each', () => {
    show('chapter');
    expect(screen.getAllByText('1° alcohol → aldehyde (PCC)')).toHaveLength(2); // once per exam version
  });
});

describe('filters', () => {
  it('Chapter and Kind options carry counts; choosing a chapter narrows the list; Clear all filters brings it back', () => {
    show('chapter');
    const chapter = screen.getByRole('combobox', { name: 'Chapter' }) as HTMLSelectElement;
    const option = [...chapter.options].find((o) => o.textContent?.startsWith('JEE Advanced 2026 (provisional) › Alcohols, phenols and ethers ('));
    expect(option).toBeTruthy();
    fireEvent.change(chapter, { target: { value: option?.value ?? '' } });
    expect(headings()).toHaveLength(1);
    expect(screen.getByText(/records shown/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(headings().length).toBeGreaterThan(1);
  });

  it('Clear all filters is only offered while a filter is set', () => {
    show();
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
