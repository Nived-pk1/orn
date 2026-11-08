// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { stubDialog } from '@/test-support/window-kit';
import { manualTimers } from '@/test-support/navigator-kit';
import { createRecentStore } from '@/ui/state';
import type { PaletteCommand, SearchPorts } from './contracts';
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

function ports(commands: readonly PaletteCommand[]): SearchPorts {
  return {
    search: () => new Promise(() => undefined),
    timers: manualTimers(),
    recent: createRecentStore(),
    examVersionId: () => undefined,
    indexState: () => ({ state: 'current' }),
    factsOf: () => ({}),
    open: () => undefined,
    commands: () => commands,
    log: () => undefined,
  };
}

describe('the empty palette lists where to go (step 8.4d, C7)', () => {
  it('shows the suggested commands; Enter runs the first, the arrows move, Esc closes', () => {
    const goA = vi.fn();
    const backup = vi.fn();
    const onClose = vi.fn();
    const commands: PaletteCommand[] = [
      { id: 'go-a', title: 'Go to A', suggest: true, run: goA },
      { id: 'zoom', title: 'Zoom in', run: () => undefined },
      { id: 'backup', title: 'Back up your data', suggest: true, run: backup },
    ];
    render(<Palette ports={ports(commands)} open onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Search' });
    const options = within(dialog).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Go to A', 'Back up your data']);
    const input = within(dialog).getByRole('combobox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(backup).toHaveBeenCalledTimes(1);
    expect(goA).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
