// @vitest-environment jsdom
/**
 * Menu in jsdom. Radix positions with ResizeObserver and uses pointer-capture calls that jsdom lacks; they are stubbed below (and
 * only those). Opening is by keyboard (Enter), as a keyboard user does it. The real browsers (focus return, no CSP violation) are
 * proved by the e2e and the spike.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Menu, type MenuItem } from './menu';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  const proto = Element.prototype as unknown as { hasPointerCapture?: () => boolean; scrollIntoView?: () => void; releasePointerCapture?: () => void };
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
});
afterEach(cleanup);

const open = (): HTMLElement => {
  const trigger = screen.getByRole('button', { name: 'File' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
  return trigger;
};

function items(onImport: () => void): MenuItem[] {
  return [
    { id: 'import', label: 'Import a file', onSelect: onImport },
    { id: 'export', label: 'Export', unavailable: 'step 5.9b' },
    { id: 'undo', label: 'Undo import', onSelect: vi.fn() },
  ];
}

describe('Menu', () => {
  it('opens from the keyboard into a menu of menuitems; the trigger is named by its label', () => {
    render(<Menu label="File" items={items(vi.fn())} />);
    expect(screen.queryByRole('menu')).toBeNull();
    open();
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Import a file', 'Exportstep 5.9b', 'Undo import']);
  });

  it('Enter on an item runs it and closes the menu', () => {
    const onImport = vi.fn();
    render(<Menu label="File" items={items(onImport)} />);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Import a file' }));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('an unavailable item is listed with its reason, is marked aria-disabled, does nothing and leaves the menu open', () => {
    render(<Menu label="File" items={items(vi.fn())} />);
    open();
    const item = screen.getByRole('menuitem', { name: /Export/ });
    expect(item.getAttribute('aria-disabled')).toBe('true');
    expect(within(item).getByText('step 5.9b')).toBeTruthy();
    fireEvent.click(item);
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('Esc closes the menu and focus goes back to the trigger', async () => {
    render(<Menu label="File" items={items(vi.fn())} />);
    const trigger = open();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('the first item takes focus on a keyboard open and ArrowDown moves to the next', async () => {
    render(<Menu label="File" items={items(vi.fn())} />);
    open();
    const [first, second] = screen.getAllByRole('menuitem');
    await waitFor(() => expect(document.activeElement).toBe(first));
    fireEvent.keyDown(first as HTMLElement, { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement).toBe(second));
  });
});

describe('Menu with a chosen item (equation step, part 6)', () => {
  it('shows the chosen item as a checked menuitemradio; choosing another runs its handler and closes the menu', () => {
    const pick = vi.fn();
    const pickers: MenuItem[] = [
      { id: 'skeletal', label: 'Skeletal', onSelect: () => pick('skeletal') },
      { id: 'condensed', label: 'Condensed', onSelect: () => pick('condensed') },
    ];
    render(<Menu label="File" items={pickers} chosen="skeletal" />);
    open();
    const radios = within(screen.getByRole('menu')).getAllByRole('menuitemradio');
    expect(radios.map((r) => [r.textContent, r.getAttribute('aria-checked')])).toEqual([['Skeletal', 'true'], ['Condensed', 'false']]);
    fireEvent.keyDown(radios[1] as HTMLElement, { key: 'Enter' });
    expect(pick).toHaveBeenCalledWith('condensed');
    expect(pick).toHaveBeenCalledTimes(1);
  });
});
