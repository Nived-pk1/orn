// @vitest-environment jsdom
/** The frame of step 8.4a (Part C and C2): the toast dock in the main column, and the view list that can be hidden. */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { INSPECTOR_MAX, INSPECTOR_MIN } from '@/ui/state';
import type { ModeItem } from './mode-rail';
import { Shell, type InspectorPane } from './shell';

const MODES: ModeItem[] = [
  { id: 'navigator', label: 'Navigator' },
  { id: 'reactions', label: 'Reactions' },
];
const pane = (): InspectorPane => ({ width: 400, min: INSPECTOR_MIN, max: INSPECTOR_MAX, open: true, onWidth: vi.fn(), onOpen: vi.fn() });

function frame(over: { toasts?: boolean; railHidden?: boolean; onRailHidden?: (hidden: boolean) => void; onModeChange?: (id: string) => void } = {}) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: /min-width:\s*(\d+)px/.test(query), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
  return render(
    <Shell
      title="ORN"
      topBar={null}
      modes={MODES}
      activeMode="navigator"
      onModeChange={over.onModeChange ?? vi.fn()}
      banners={null}
      canvas={<p>the canvas</p>}
      inspectorTitle="Inspector"
      inspector={<p>the inspector</p>}
      pane={pane()}
      statusBar={null}
      {...(over.toasts === true ? { toasts: <p data-testid="toast">Imported</p>, toastShowing: true } : {})}
      {...(over.railHidden === undefined ? {} : { railHidden: over.railHidden })}
      {...(over.onRailHidden === undefined ? {} : { onRailHidden: over.onRailHidden })}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the toast dock', () => {
  it('sits in the main column (with the canvas), never inside the inspector', () => {
    frame({ toasts: true });
    const toast = screen.getByTestId('toast');
    expect(toast.closest('aside')).toBeNull();
    expect(toast.parentElement?.parentElement).toBe(screen.getByText('the canvas').closest('main')?.parentElement); // the dock and the canvas share the main column
  });
  it('says on the frame that a toast is showing, so a page can keep room below its last item', () => {
    const { container } = frame({ toasts: true });
    expect(container.querySelector('[data-toast]')).not.toBeNull();
  });
});

describe('the view list (rail)', () => {
  it('has a Hide button at its foot; it asks to hide the rail', () => {
    const onRailHidden = vi.fn();
    frame({ onRailHidden });
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Modes' })).getByRole('button', { name: 'Hide' }));
    expect(onRailHidden).toHaveBeenCalledWith(true);
  });
  it('hidden: no rail; the header has a "☰ <current view>" menu button', () => {
    frame({ railHidden: true, onRailHidden: vi.fn() });
    expect(screen.queryByRole('navigation', { name: 'Modes' })).toBeNull();
    expect(screen.getByRole('button', { name: /Navigator/ }).textContent).toContain('☰');
  });
});
