// @vitest-environment jsdom
/** The drafts list (ADR-040, step 6.1a part 3): rows, Open, Discard with its confirm, an unreadable row, "changed since", the empty list. */
import { utcTime } from '@/test-support/editing-kit';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { stubDialog } from '@/test-support/window-kit';
import type { DraftsListPort, DraftsViewModel } from './contracts';
import { DraftsDialog } from './drafts-dialog';

beforeAll(stubDialog);
afterEach(cleanup);

function port(view: DraftsViewModel) {
  let current = view;
  const listeners = new Set<() => void>();
  const discard = vi.fn(async (id: string) => {
    current = { ...current, items: current.items.filter((i) => i.id !== id), count: (current.count ?? 0) - 1 };
    listeners.forEach((l) => l());
  });
  const discardUnreadable = vi.fn(async (id: string) => {
    current = { ...current, items: current.items.filter((i) => i.id !== id), count: (current.count ?? 0) - 1 };
    listeners.forEach((l) => l());
  });
  const p: DraftsListPort = {
    view: () => current,
    subscribe: (l) => (listeners.add(l), () => void listeners.delete(l)),
    discard,
    discardUnreadable,
  };
  return { p, discard, discardUnreadable };
}

const VIEW: DraftsViewModel = {
  keeping: 'stored',
  count: 3,
  items: [
    { id: 'eds_a', unreadable: false, kind: 'species', name: 'Ethanol', isNew: false, updatedAt: '2026-10-17T12:34:56.000Z', changedSince: true },
    { id: 'eds_b', unreadable: false, kind: 'reaction', name: 'New reaction', isNew: true, updatedAt: '2026-10-17T09:00:00.000Z', changedSince: false },
    { id: 'eds_c', unreadable: true, reason: 'kind: Invalid option' },
  ],
};

describe('DraftsDialog', () => {
  it('lists each draft with its name, kind and edit time; a changed record says so; an unreadable row says it could not be read', () => {
    render(<DraftsDialog open formatTime={utcTime} onClose={() => undefined} port={port(VIEW).p} />);
    const list = screen.getByRole('list', { name: 'Unfinished drafts' });
    const [first, second, third] = within(list).getAllByRole('listitem');
    expect(first?.textContent).toContain('Ethanol');
    expect(first?.textContent).toContain('species');
    expect(first?.textContent).toContain('2026-10-17 12:34 UTC');
    expect(first?.textContent).toContain('The record changed since this draft was started.');
    expect(second?.textContent).toContain('(new record)');
    expect(second?.textContent).not.toContain('changed since');
    expect(third?.textContent).toContain('1 draft could not be read');
    expect(within(third as HTMLElement).queryByRole('button', { name: 'Open' })).toBeNull();
    expect(within(third as HTMLElement).getByRole('button', { name: 'Discard' })).toBeTruthy();
  });

  it('Open asks the window to open that draft', () => {
    const open = vi.fn();
    render(<DraftsDialog open formatTime={utcTime} onClose={() => undefined} port={port(VIEW).p} onOpenDraft={open} />);
    fireEvent.click(within(screen.getAllByRole('listitem')[1] as HTMLElement).getByRole('button', { name: 'Open' }));
    expect(open).toHaveBeenCalledWith('eds_b');
  });

  it('Open is unavailable with the reason when the window cannot open drafts yet', () => {
    render(<DraftsDialog open formatTime={utcTime} onClose={() => undefined} port={port(VIEW).p} openUnavailable="not built yet" />);
    const button = within(screen.getAllByRole('listitem')[0] as HTMLElement).getByRole('button', { name: 'Open' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getAllByText('not built yet').length).toBeGreaterThan(0);
  });

  it('Discard asks first ("Discard this draft? It cannot be undone."); Keep it changes nothing; Discard removes it', async () => {
    const { p, discard } = port(VIEW);
    render(<DraftsDialog open formatTime={utcTime} onClose={() => undefined} port={p} onOpenDraft={() => undefined} />);
    const row = (): HTMLElement => screen.getAllByRole('listitem')[0] as HTMLElement;
    fireEvent.click(within(row()).getByRole('button', { name: 'Discard' }));
    expect(within(row()).getByText('Discard this draft? It cannot be undone.')).toBeTruthy();
    expect(discard).not.toHaveBeenCalled();
    fireEvent.click(within(row()).getByRole('button', { name: 'Keep it' }));
    expect(discard).not.toHaveBeenCalled();
    expect(within(row()).queryByText(/cannot be undone/)).toBeNull();
    fireEvent.click(within(row()).getByRole('button', { name: 'Discard' }));
    await act(async () => fireEvent.click(within(row()).getByRole('button', { name: 'Discard' })));
    expect(discard).toHaveBeenCalledWith('eds_a');
    expect(screen.queryByText('Ethanol')).toBeNull();
  });

  it('an unreadable row is discarded through its own port call, after the same question', async () => {
    const { p, discardUnreadable } = port(VIEW);
    render(<DraftsDialog open formatTime={utcTime} onClose={() => undefined} port={p} />);
    const row = (): HTMLElement => screen.getAllByRole('listitem')[2] as HTMLElement;
    fireEvent.click(within(row()).getByRole('button', { name: 'Discard' }));
    expect(within(row()).getByText(/cannot be undone/)).toBeTruthy();
    await act(async () => fireEvent.click(within(row()).getByRole('button', { name: 'Discard' })));
    expect(discardUnreadable).toHaveBeenCalledWith('eds_c');
  });

  it('with no drafts it says so', () => {
    render(<DraftsDialog open formatTime={utcTime} onClose={() => undefined} port={port({ keeping: 'stored', count: 0, items: [] }).p} />);
    expect(screen.getByText('No unfinished drafts.')).toBeTruthy();
  });
});
