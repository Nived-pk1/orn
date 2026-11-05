// @vitest-environment jsdom
/** A shell with no status bar (step 8.3, C1): no footer and no reserved row,. */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { INSPECTOR_MAX, INSPECTOR_MIN } from '@/ui/state';
import { Shell } from './shell';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function viewport(width: number): void {
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    return { matches: min !== null && width >= Number(min[1]), media: query, addEventListener: () => undefined, removeEventListener: () => undefined };
  });
}

const shell = (statusBar: React.ReactNode) => (
  <Shell
    title="Organic Reaction Navigator"
    topBar={null}
    modes={[{ id: 'map', label: 'Map' }]}
    activeMode="map"
    onModeChange={vi.fn()}
    banners={null}
    canvas={<p>c</p>}
    inspectorTitle="Inspector"
    inspector={<p>i</p>}
    pane={{ width: 400, min: INSPECTOR_MIN, max: INSPECTOR_MAX, open: true, onWidth: vi.fn(), onOpen: vi.fn() }}
    statusBar={statusBar}

  />
);

describe('the status bar slot', () => {
  it('desktop, a bar given: the footer is there and the shell says so', () => {
    viewport(1400);
    const { container } = render(shell(<span>the status</span>));
    expect(screen.getByRole('contentinfo').textContent).toBe('the status');
    expect(container.querySelector('[data-status-bar="none"]')).toBeNull();
  });
  it('desktop, no bar (undefined): no footer at all and the shell collapses the row', () => {
    viewport(1400);
    const { container } = render(shell(undefined));
    expect(screen.queryByRole('contentinfo')).toBeNull();
    expect(container.querySelector('[data-status-bar="none"]')).not.toBeNull();
  });
});
