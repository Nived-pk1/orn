// @vitest-environment jsdom
/** The map toolbar (step 8.3b, A1, A3): one row in the stated order; a narrow row moves From A to B and Open family into More; Key opens the legend. */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapToolbar, type MapToolbarProps } from './map-toolbar';

const base: MapToolbarProps = {
  listing: false,
  noScene: false,
  onToggleList: () => undefined,
  onZoomIn: () => undefined,
  onZoomOut: () => undefined,
  onFit: () => undefined,
  chapters: [{ id: 'c1', title: 'Alcohols and phenols' }],
  chapterId: null,
  onChapter: () => undefined,
  families: [{ id: 'a', name: 'Alcohols' }],
  onFind: () => undefined,
  chainOpen: false,
  onToggleChain: () => undefined,
  openReason: 'select a family first',
  onOpenFamily: () => undefined,
  keyOpen: false,
  onToggleKey: () => undefined,
  keyPopover: <div role="dialog" aria-label="Key">the key</div>,
};

let width = 5000;
class FakeObserver {
  constructor(private readonly run: (entries: unknown[]) => void) {}
  observe(): void {
    this.run([]);
  }
  disconnect(): void {}
}
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeObserver);
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: 40, width, height: 40, toJSON: () => ({}) };
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  width = 5000;
});

const rowNames = (): string[] => within(screen.getByRole('toolbar', { name: 'Canvas tools' })).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '');

describe('MapToolbar', () => {
  it('is ONE row in the stated order: Zoom out, Zoom in, Fit, the chapter select, Find, From A to B, Open family, Key, More', () => {
    render(<MapToolbar {...base} />);
    const toolbar = screen.getAllByRole('toolbar', { name: 'Canvas tools' });
    expect(toolbar).toHaveLength(1);
    const names = rowNames();
    expect(names.slice(0, 3)).toEqual(['Zoom out', 'Zoom in', 'Fit']);
    expect(names.filter((n) => ['From A to B', 'Open family', 'Key', 'More'].includes(n))).toEqual(['From A to B', 'Open family', 'Key', 'More']);
    expect(within(toolbar[0] as HTMLElement).getByRole('combobox', { name: 'Chapter' })).toBeTruthy();
  });
  it('the icon buttons have names (and so tooltips)', () => {
    render(<MapToolbar {...base} />);
    for (const name of ['Zoom out', 'Zoom in', 'Fit']) expect(screen.getByRole('button', { name })).toBeTruthy();
  });
  it('a narrow row moves From A to B, then Open family, into More', async () => {
    width = 1000;
    render(<MapToolbar {...base} />);
    expect(screen.queryByRole('button', { name: 'From A to B' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open family' })).toBeTruthy();
    cleanup();
    width = 700;
    render(<MapToolbar {...base} />);
    expect(screen.queryByRole('button', { name: 'Open family' })).toBeNull();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More' }), { button: 0, ctrlKey: false });
    expect(await screen.findByRole('menuitem', { name: 'From A to B' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /^Open family/ }).getAttribute('aria-disabled')).toBe('true');
  });
  it('More holds List (and in Studio the Unanchored reactions)', async () => {
    render(<MapToolbar {...base} unanchored={{ count: 2, expanded: false, reason: undefined, onToggle: () => undefined }} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More' }), { button: 0, ctrlKey: false });
    expect(await screen.findByRole('menuitem', { name: 'List' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Unanchored reactions (2)' })).toBeTruthy();
  });
  it('Key reports a click and shows the popover while open', () => {
    const onToggleKey = vi.fn();
    const { rerender } = render(<MapToolbar {...base} onToggleKey={onToggleKey} />);
    expect(screen.queryByRole('dialog', { name: 'Key' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Key' }));
    expect(onToggleKey).toHaveBeenCalledTimes(1);
    rerender(<MapToolbar {...base} keyOpen onToggleKey={onToggleKey} />);
    expect(screen.getByRole('dialog', { name: 'Key' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Key' }).getAttribute('aria-expanded')).toBe('true');
  });
  it('the zoom buttons say why they are off in the List view', () => {
    render(<MapToolbar {...base} listing />);
    expect(screen.getByRole('button', { name: 'Zoom in' }).getAttribute('aria-disabled')).toBe('true');
  });
});
