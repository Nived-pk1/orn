// @vitest-environment jsdom
/**
 * The palette component (step 5.8, jsdom): cmdk inside our Dialog, the rows windowed, keyboard only (type, arrows, Page keys, Enter), a
 * command that cannot run says why, NOT_READY says "Search is starting", the match is in words. axe runs in the e2e (a real browser).
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RecordRef } from '@/core/schema';
import type { SearchHit } from '@/search/contracts';
import { manualTimers } from '@/test-support/navigator-kit';
import { stubDialog } from '@/test-support/window-kit';
import { createRecentStore } from '@/ui/state';
import { PALETTE_DEBOUNCE_MS, PALETTE_LIMIT, type PaletteCommand, type PaletteSearchAnswer, type SearchPorts } from './contracts';
import { Palette } from './palette';

beforeAll(() => {
  stubDialog();
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  (Element.prototype as { scrollIntoView?: () => void }).scrollIntoView ??= () => undefined;
});
afterEach(cleanup);

const hits = (count: number, kind = 'species'): SearchHit[] =>
  Array.from({ length: count }, (_, i) => ({ ref: { kind, id: `id_${i}` } as RecordRef, score: 1, title: `Name ${i}`, matchedField: 'alias', matchedText: `alias ${i}` }));

function rig(answer: PaletteSearchAnswer, commands: readonly PaletteCommand[] = []) {
  const timers = manualTimers();
  const opened: [RecordRef, string][] = [];
  const closed = vi.fn();
  const recent = createRecentStore(['old search']);
  const ports: SearchPorts = {
    search: vi.fn(() => Promise.resolve(answer)),
    timers,
    recent,
    examVersionId: () => undefined,
    factsOf: () => ({}),
    open: (ref, title) => void opened.push([ref, title]),
    commands: () => commands,
    log: () => undefined,
  };
  render(<Palette ports={ports} open onClose={closed} />);
  const input = screen.getByRole('combobox');
  const type = async (text: string): Promise<void> => {
    fireEvent.change(input, { target: { value: text } });
    await act(async () => {
      timers.advance(PALETTE_DEBOUNCE_MS);
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  const key = (name: string): void => void fireEvent.keyDown(input, { key: name });
  return { ports, input, type, key, opened, closed, recent, timers };
}

describe('the palette', () => {
  it('opens with the input focused and the recent searches listed', () => {
    const r = rig({ ok: true, value: [] });
    expect(document.activeElement).toBe(r.input);
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getByText('old search')).toBeTruthy();
  });

  it('keyboard only: type, ArrowDown twice, Enter opens the third result and closes', async () => {
    const r = rig({ ok: true, value: hits(5) });
    await r.type('name');
    const options = screen.getAllByRole('option');
    expect(options[0]?.getAttribute('aria-selected')).toBe('true');
    r.key('ArrowDown');
    r.key('ArrowDown');
    expect(screen.getAllByRole('option')[2]?.getAttribute('aria-selected')).toBe('true');
    r.key('Enter');
    expect(r.opened).toEqual([[{ kind: 'species', id: 'id_2' }, 'Name 2']]);
    expect(r.closed).toHaveBeenCalledTimes(1);
    expect(r.recent.getState().items[0]).toBe('name');
  });

  it('shows what matched in words and the kind, grouped under a header', async () => {
    const r = rig({ ok: true, value: hits(2) });
    await r.type('name');
    expect(screen.getByText('Species (2)')).toBeTruthy();
    expect(screen.getByText('Matched the alias “alias 0”')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('2 results');
  });

  it('a hundred hits render a handful of options; End-ward keys reach the last one and Enter opens it', async () => {
    const r = rig({ ok: true, value: hits(100) });
    await r.type('name');
    expect(screen.getAllByRole('option').length).toBeLessThan(25);
    for (let i = 0; i < 20; i += 1) r.key('PageDown');
    expect(screen.getAllByRole('option').length).toBeLessThan(25);
    r.key('Enter');
    expect(r.opened[0]?.[1]).toBe('Name 99');
    // each option still says where it is in the whole list
    expect(PALETTE_LIMIT).toBe(100);
  });

  it('NOT_READY says "Search is starting" and lists no results', async () => {
    const r = rig({ ok: false, code: 'NOT_READY', message: 'no index' });
    await r.type('ethanol');
    expect(screen.getByRole('status').textContent).toBe('Search is starting');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('"> " lists commands; an unavailable one says why and does not run or close', async () => {
    const run = vi.fn();
    const r = rig({ ok: true, value: [] }, [
      { id: 'fit', title: 'Fit', run },
      { id: 'zoom', title: 'Zoom in', run, unavailable: 'the map is not shown' },
    ]);
    await r.type('>');
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(within(options[1] as HTMLElement).getByText('Not available: the map is not shown')).toBeTruthy();
    expect(options[1]?.getAttribute('aria-disabled')).toBe('true');
    r.key('ArrowDown');
    r.key('Enter');
    expect(run).not.toHaveBeenCalled();
    expect(r.closed).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('Zoom in is not available: the map is not shown.');
    r.key('ArrowUp');
    r.key('Enter');
    expect(run).toHaveBeenCalledTimes(1);
    expect(r.closed).toHaveBeenCalledTimes(1);
  });

  it('Enter on a recent search types it again', async () => {
    const r = rig({ ok: true, value: hits(1) });
    r.key('Enter');
    expect((r.input as HTMLInputElement).value).toBe('old search');
  });

  it('a mouse click on a result opens it', async () => {
    const r = rig({ ok: true, value: hits(3) });
    await r.type('name');
    fireEvent.click(screen.getAllByRole('option')[1] as HTMLElement);
    expect(r.opened[0]?.[1]).toBe('Name 1');
  });
});
