// @vitest-environment jsdom
/**
 * The shell frame in jsdom: regions and landmarks, the mode rail (what exists is enabled, the rest is listed with its phase), the
 * resizable inspector (keyboard), and the three breakpoints through a stubbed `matchMedia` (jsdom has none; the CSS itself is
 * proved by the e2e, which resizes a real viewport).
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { INSPECTOR_MAX, INSPECTOR_MIN } from '@/ui/state';
import type { ModeItem } from './mode-rail';
import { BIG_STEP, STEP } from './resize-handle';
import { Shell, type InspectorPane } from './shell';

const MODES: ModeItem[] = [
  { id: 'navigator', label: 'Navigator' },
  { id: 'reactions', label: 'Reactions', unavailable: 'Phase 7' },
  { id: 'workbench', label: 'Workbench', unavailable: 'Phase 6' },
];

/** Makes `matchMedia` answer for a viewport width. */
function viewport(width: number): void {
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    return { matches: min !== null && width >= Number(min[1]), media: query, addEventListener: () => undefined, removeEventListener: () => undefined };
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function pane(over: Partial<InspectorPane> = {}): InspectorPane {
  return { width: 400, min: INSPECTOR_MIN, max: INSPECTOR_MAX, open: true, onWidth: vi.fn(), onOpen: vi.fn(), ...over };
}

function renderShell(over: { pane?: InspectorPane; onModeChange?: (id: string) => void } = {}) {
  return render(
    <Shell
      title="Organic Reaction Navigator"
      topBar={<span>top controls</span>}
      modes={MODES}
      activeMode="navigator"
      onModeChange={over.onModeChange ?? vi.fn()}
      banners={<p>a banner</p>}
      canvas={<p>the canvas</p>}
      inspectorTitle="Inspector"
      inspector={<p>nothing selected</p>}
      pane={over.pane ?? pane()}
      statusBar={<span>the status</span>}
    />,
  );
}

describe('the edition marker (studio step)', () => {
  const withMarker = (marker?: string, phone = false) => (
    <Shell
      title="Organic Reaction Navigator"
      topBar={null}
      modes={MODES}
      activeMode="navigator"
      onModeChange={vi.fn()}
      banners={null}
      canvas={<p>c</p>}
      inspectorTitle="Inspector"
      inspector={<p>i</p>}
      pane={pane()}
      statusBar={null}
      {...(marker === undefined ? {} : { marker })}
      {...(phone ? { phone: { bar: <span>bar</span>, notices: null, alert: null, tabs: null } } : {})}
    />
  );
  it('shows the marker beside the title, outside the h1, on a desktop; absent without one', () => {
    viewport(1400);
    const { unmount } = render(withMarker('Studio'));
    expect(within(screen.getByRole('banner')).getByText('Studio')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Organic Reaction Navigator' })).toBeTruthy();
    unmount();
    render(withMarker());
    expect(within(screen.getByRole('banner')).queryByText('Studio')).toBeNull();
  });
  it('shows it on a phone too, beside the short title', () => {
    viewport(400);
    render(withMarker('Studio', true));
    expect(within(screen.getByRole('banner')).getByText('Studio')).toBeTruthy();
  });
});

describe('the shell frame', () => {
  it('has the six regions: heading and top bar, modes, banners, main canvas, the inspector, the status bar', () => {
    renderShell();
    expect(screen.getByRole('heading', { level: 1, name: 'Organic Reaction Navigator' })).toBeTruthy();
    expect(screen.getByText('top controls')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Modes' })).toBeTruthy();
    expect(screen.getByText('a banner')).toBeTruthy();
    expect(within(screen.getByRole('main')).getByText('the canvas')).toBeTruthy();
    expect(within(screen.getByRole('complementary', { name: 'Inspector' })).getByText('nothing selected')).toBeTruthy();
    expect(within(screen.getByRole('contentinfo')).getByText('the status')).toBeTruthy();
  });

  it('the title is the h1, unless the screen says its own content carries it', () => {
    viewport(1400);
    const { unmount } = renderShell();
    expect(screen.getByRole('heading', { level: 1, name: 'Organic Reaction Navigator' })).toBeTruthy();
    unmount();
    render(<Shell title="Organic Reaction Navigator" titleHeading={false} topBar={null} modes={MODES} activeMode="navigator" onModeChange={vi.fn()} banners={null} canvas={<h1>Alcohols</h1>} inspectorTitle="Inspector" inspector={null} pane={pane()} statusBar={null} />);
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Alcohols']);
    expect(screen.getByText('Organic Reaction Navigator')).toBeTruthy();
  });

  it('knows nothing about the app: it renders what it is given and nothing else', () => {
    const { container } = renderShell();
    expect(container.textContent).not.toMatch(/Saved|Findings|Starting up/);
  });
});

describe('the mode rail', () => {
  it('Navigator is the only enabled mode; the others are listed, aria-disabled, with the phase that brings them', () => {
    const onModeChange = vi.fn();
    renderShell({ onModeChange });
    const navigator = screen.getByRole('button', { name: 'Navigator' });
    expect(navigator.getAttribute('aria-current')).toBe('page');
    expect(navigator.getAttribute('aria-disabled')).toBeNull();
    for (const [name, phase] of [['Reactions', 'Phase 7'], ['Workbench', 'Phase 6']] as const) {
      const button = screen.getByRole('button', { name: new RegExp(name) });
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(within(button).getByText(phase)).toBeTruthy();
      expect(button.getAttribute('aria-current')).toBeNull();
      fireEvent.click(button);
    }
    expect(onModeChange).not.toHaveBeenCalled();
    fireEvent.click(navigator);
    expect(onModeChange).toHaveBeenCalledWith('navigator');
  });

  it('a disabled mode says why to assistive technology', () => {
    renderShell();
    expect(screen.getByRole('button', { name: /Reactions/, description: 'not available yet: Phase 7' })).toBeTruthy();
  });
});

describe('the inspector pane at the wide breakpoint', () => {
  it('is a separator with min, max and now; the arrow keys change the width by a step, Shift by a big step, Home and End go to the ends', () => {
    viewport(1400);
    const onWidth = vi.fn();
    renderShell({ pane: pane({ onWidth }) });
    const handle = screen.getByRole('separator', { name: 'Resize inspector' });
    expect(handle.getAttribute('aria-valuemin')).toBe(String(INSPECTOR_MIN));
    expect(handle.getAttribute('aria-valuemax')).toBe(String(INSPECTOR_MAX));
    expect(handle.getAttribute('aria-valuenow')).toBe('400');
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(onWidth).toHaveBeenLastCalledWith(400 + STEP);
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onWidth).toHaveBeenLastCalledWith(400 - STEP);
    fireEvent.keyDown(handle, { key: 'ArrowLeft', shiftKey: true });
    expect(onWidth).toHaveBeenLastCalledWith(400 + BIG_STEP);
    fireEvent.keyDown(handle, { key: 'Home' });
    expect(onWidth).toHaveBeenLastCalledWith(INSPECTOR_MIN);
    fireEvent.keyDown(handle, { key: 'End' });
    expect(onWidth).toHaveBeenLastCalledWith(INSPECTOR_MAX);
    onWidth.mockClear();
    fireEvent.keyDown(handle, { key: 'a' });
    expect(onWidth).not.toHaveBeenCalled();
  });

  it('the toggle changes the persisted open state and the inspector is hidden when closed (no handle either)', () => {
    viewport(1400);
    const onOpen = vi.fn();
    const { rerender } = renderShell({ pane: pane({ onOpen }) });
    fireEvent.click(screen.getByRole('button', { name: 'Hide inspector' }));
    expect(onOpen).toHaveBeenCalledWith(false);
    rerender(
      <Shell title="t" topBar={null} modes={MODES} activeMode="navigator" onModeChange={vi.fn()} banners={null} canvas={null} inspectorTitle="Inspector" inspector={null} pane={pane({ open: false, onOpen })} statusBar={null} />,
    );
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
    expect(screen.queryByRole('separator')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show inspector' }));
    expect(onOpen).toHaveBeenLastCalledWith(true);
  });

  it('a drag with the pointer turns the pointer position into a width measured from the shell\'s right edge', () => {
    viewport(1400);
    const onWidth = vi.fn();
    const { container } = renderShell({ pane: pane({ onWidth }) });
    const shell = container.firstElementChild as HTMLElement;
    shell.getBoundingClientRect = () => ({ right: 1400 }) as DOMRect;
    const handle = screen.getByRole('separator');
    fireEvent.pointerDown(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 900 });
    expect(onWidth).toHaveBeenLastCalledWith(500);
    fireEvent.pointerUp(handle, { pointerId: 1 });
    onWidth.mockClear();
    fireEvent.pointerMove(handle, { clientX: 800 });
    expect(onWidth).not.toHaveBeenCalled();
  });
});

describe('the breakpoints', () => {
  it.each([
    [1400, 'wide'],
    [1280, 'wide'],
    [1279, 'medium'],
    [900, 'medium'],
    [899, 'narrow'],
    [360, 'narrow'],
  ])('a viewport %i px wide is the %s layout', (width, expected) => {
    viewport(width);
    const { container } = renderShell();
    expect((container.firstElementChild as HTMLElement).dataset.breakpoint).toBe(expected);
  });

  it.each([[1100], [500]])('at %i px the inspector is a drawer or sheet: closed at first, no resize handle, opened by the toggle without touching the persisted state, closed by Esc and by its Close button', (width) => {
    viewport(width);
    const onOpen = vi.fn();
    renderShell({ pane: pane({ onOpen }) });
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
    expect(screen.queryByRole('separator')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show inspector' }));
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.keyDown(within(inspector).getByRole('button', { name: 'Close inspector' }), { key: 'Escape' });
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show inspector' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close inspector' }));
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
  });
});
