// @vitest-environment jsdom
/**
 * Step 8.5h B1: the one "Structures" choice a page header carries. It is the app-wide setting (handed down by context), segmented on a
 * desktop and one menu button on a phone; without the setting there is nothing.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StructureMode } from '@/chem/contracts';
import { StructuresChoice } from './choice';
import { StructuresContext, type StructuresSetting } from './context';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setting(): StructuresSetting {
  let mode: StructureMode = 'skeletal';
  const listeners = new Set<() => void>();
  return {
    mode: () => mode,
    setMode: (next) => {
      mode = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => (listeners.add(listener), () => void listeners.delete(listener)),
  };
}

describe('StructuresChoice', () => {
  it('is a radio group that follows the setting and changes it, the same one everywhere', () => {
    const value = setting();
    render(
      <StructuresContext.Provider value={value}>
        <StructuresChoice />
        <StructuresChoice />
      </StructuresContext.Provider>,
    );
    expect(screen.getAllByRole('radiogroup', { name: 'Structures' }).length).toBe(2);
    act(() => void fireEvent.click(screen.getAllByRole('radio', { name: 'Condensed' })[0] as HTMLElement));
    expect(value.mode()).toBe('condensed');
    for (const radio of screen.getAllByRole('radio', { name: 'Condensed' })) expect((radio as HTMLInputElement).checked).toBe(true);
  });

  it('renders nothing without the setting', () => {
    const { container } = render(<StructuresChoice />);
    expect(container.childElementCount).toBe(0);
  });
});
