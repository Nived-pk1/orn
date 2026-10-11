// @vitest-environment jsdom
/**
 * Undo and Redo in the top bar are bound to the store (step 5.8, note E9): with no history they are unavailable with the reason in
 * words; with history they act on the store and follow it; a read-only tab says so; a refused step is said in a toast. Phase 5 has no
 * editing, so the binding is proved with a stub store that has history.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActiveExamStore } from '@/ui/state';
import { ToastProvider } from '@/ui/primitives';
import { createCanonicalStore } from '@/core/commands';
import { emptyStoreState } from '@/test-support/window-kit';
import { historyReason, TopBar, type HistoryBinding } from './top-bar';

afterEach(cleanup);

function stub(initial: { undo: number; redo: number; readOnly?: boolean }) {
  const state = { ...initial };
  const listeners = new Set<() => void>();
  const calls: string[] = [];
  const store: HistoryBinding & { calls: string[]; set(next: Partial<typeof state>): void; fail: { code: string; message: string } | undefined } = {
    calls,
    fail: undefined,
    canUndo: () => state.undo > 0,
    canRedo: () => state.redo > 0,
    isReadOnly: () => state.readOnly === true,
    undo() {
      calls.push('undo');
      if (store.fail !== undefined) return { ok: false, error: store.fail };
      state.undo -= 1;
      state.redo += 1;
      listeners.forEach((l) => l());
      return { ok: true };
    },
    redo() {
      calls.push('redo');
      state.redo -= 1;
      state.undo += 1;
      listeners.forEach((l) => l());
      return { ok: true };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    set(next) {
      Object.assign(state, next);
      listeners.forEach((l) => l());
    },
  };
  return store;
}

function show(history: HistoryBinding) {
  const exam = { exam: createActiveExamStore(), store: createCanonicalStore({ initial: emptyStoreState(), revision: 0, validateInitial: false }), hasData: false, log: () => undefined };
  render(
    <ToastProvider>
      <TopBar onSearch={() => undefined} history={history} exam={exam} />
    </ToastProvider>,
  );
}

const button = (name: string) => screen.getByRole('button', { name });

describe('Undo and Redo', () => {
  it('with no history both are unavailable and say why in words', () => {
    show(stub({ undo: 0, redo: 0 }));
    expect(button('Undo').getAttribute('aria-disabled')).toBe('true');
    expect(button('Redo').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Nothing to undo (editing arrives in Phase 6)')).toBeTruthy();
    expect(screen.getByText('Nothing to redo (editing arrives in Phase 6)')).toBeTruthy();
  });

  it('with history they act on the store and follow it', () => {
    const store = stub({ undo: 1, redo: 0 });
    show(store);
    expect(button('Undo').getAttribute('aria-disabled')).toBeNull();
    expect(button('Redo').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button('Undo'));
    expect(store.calls).toEqual(['undo']);
    expect(button('Undo').getAttribute('aria-disabled')).toBe('true'); // the history moved
    expect(button('Redo').getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(button('Redo'));
    expect(store.calls).toEqual(['undo', 'redo']);
    expect(button('Undo').getAttribute('aria-disabled')).toBeNull();
  });

  it('an unavailable button does nothing when pressed', () => {
    const store = stub({ undo: 0, redo: 0 });
    show(store);
    fireEvent.click(button('Undo'));
    expect(store.calls).toEqual([]);
  });

  it('follows a commit made elsewhere', () => {
    const store = stub({ undo: 0, redo: 0 });
    show(store);
    act(() => store.set({ undo: 2 }));
    expect(button('Undo').getAttribute('aria-disabled')).toBeNull();
  });

  it('a read-only tab says so, even with history', () => {
    const store = stub({ undo: 3, redo: 3, readOnly: true });
    show(store);
    expect(button('Undo').getAttribute('aria-disabled')).toBe('true');
    expect(historyReason(store, 'undo')).toBe('this tab is read-only');
    expect(historyReason(store, 'redo')).toBe('this tab is read-only');
  });

  it('a refused step is said in a toast with its code', () => {
    const store = stub({ undo: 1, redo: 0 });
    store.fail = { code: 'STALE', message: 'the history does not apply' };
    show(store);
    fireEvent.click(button('Undo'));
    expect(screen.getByText('Undo failed (STALE): the history does not apply')).toBeTruthy();
  });

  it('the real store fits the binding: a new store has nothing to undo', () => {
    const real = createCanonicalStore({ initial: emptyStoreState(), revision: 0, validateInitial: false });
    expect(historyReason(real, 'undo')).toBe('Nothing to undo (editing arrives in Phase 6)');
    expect(vi.isMockFunction(real.undo)).toBe(false);
  });
});
