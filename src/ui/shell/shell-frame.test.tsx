// @vitest-environment jsdom
/**
 * The frame of step 8.4a (the toast dock in the main column) and of step 8.4d (Part C): the skip link, the mark and breadcrumb, the
 * search / command box, the grouped icon rail that collapses to icons, and the heights of the bars.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { INSPECTOR_MAX, INSPECTOR_MIN } from '@/ui/state';
import type { ModeItem } from './mode-rail';
import { Shell, type InspectorPane, type ShellProps } from './shell';

const MODES: ModeItem[] = [
  { id: 'navigator', label: 'Navigator', icon: 'map', group: 'study' },
  { id: 'reactions', label: 'Reactions', icon: 'flask', group: 'study' },
  { id: 'review', label: 'Review', icon: 'clipboard-check', group: 'author', count: 3 },
];
const pane = (): InspectorPane => ({ width: 400, min: INSPECTOR_MIN, max: INSPECTOR_MAX, open: true, onWidth: vi.fn(), onOpen: vi.fn() });

type Over = Partial<Pick<ShellProps, 'railCollapsed' | 'onRailCollapsed' | 'crumb' | 'commandBox' | 'onModeChange' | 'modes' | 'marker'>> & { toasts?: boolean };

function frame(over: Over = {}) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: /min-width:\s*(\d+)px/.test(query), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
  const { toasts, ...rest } = over;
  return render(
    <Shell
      title="ORN"
      topBar={<button type="button">File</button>}
      modes={MODES}
      activeMode="navigator"
      onModeChange={vi.fn()}
      banners={null}
      canvas={<p>the canvas</p>}
      inspectorTitle="Inspector"
      inspector={<p>the inspector</p>}
      pane={pane()}
      statusBar={null}
      {...(toasts === true ? { toasts: <p data-testid="toast">Imported</p>, toastShowing: true } : {})}
      {...rest}
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

describe('the view list (rail), step 8.4d', () => {
  it('has groups: "Study" and "Author" headings, each over its own views', () => {
    frame();
    const rail = screen.getByRole('navigation', { name: 'Modes' });
    const groups = within(rail).getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Study', 'Author']);
    expect(within(groups[0] as HTMLElement).getAllByRole('button').map((b) => b.textContent)).toEqual(['Navigator', 'Reactions']);
    expect(within(groups[1] as HTMLElement).getByRole('button', { name: /Review/ })).not.toBeNull();
  });

  it('draws an icon on every view and shows a count where the app has one (Review: 3)', () => {
    frame();
    const rail = screen.getByRole('navigation', { name: 'Modes' });
    expect(rail.querySelectorAll('span[aria-hidden="true"][style*="/icons/"]').length).toBeGreaterThanOrEqual(3);
    expect(within(rail).getByRole('button', { name: /Review/ }).textContent).toContain('3');
  });

  it('has no Author heading when no view is an author view', () => {
    frame({ modes: MODES.filter((m) => m.group !== 'author') });
    expect(within(screen.getByRole('navigation', { name: 'Modes' })).getAllByRole('group')).toHaveLength(1);
  });

  it('has a Collapse button at its foot; it asks to collapse the rail', () => {
    const onRailCollapsed = vi.fn();
    frame({ onRailCollapsed });
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Modes' })).getByRole('button', { name: 'Collapse' }));
    expect(onRailCollapsed).toHaveBeenCalledWith(true);
  });

  it('collapsed: the rail stays (icons only), every view keeps its name, and Expand is offered', () => {
    const onRailCollapsed = vi.fn();
    const { container } = frame({ railCollapsed: true, onRailCollapsed });
    expect(container.querySelector('[data-rail="collapsed"]')).not.toBeNull();
    const rail = screen.getByRole('navigation', { name: 'Modes' });
    expect(within(rail).getByRole('button', { name: 'Navigator' })).not.toBeNull();
    fireEvent.click(within(rail).getByRole('button', { name: 'Expand' }));
    expect(onRailCollapsed).toHaveBeenCalledWith(false);
  });

  it('the current view is marked with aria-current (never colour alone)', () => {
    frame();
    expect(screen.getByRole('button', { name: 'Navigator' }).getAttribute('aria-current')).toBe('page');
  });
});

describe('the top bar, step 8.4d', () => {
  it('starts with the app mark and the breadcrumb "view > record"', () => {
    frame({ crumb: { section: 'Map', record: 'Alcohols' } });
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav.textContent).toBe('MapAlcohols');
    expect(within(nav).getByText('Alcohols').getAttribute('aria-current')).toBe('page');
    expect(document.querySelector('header [data-app-mark]')).not.toBeNull();
  });

  it('a breadcrumb with no record shows the view alone, as the current page', () => {
    frame({ crumb: { section: 'Reactions' } });
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav.textContent).toBe('Reactions');
    expect(within(nav).getByText('Reactions').getAttribute('aria-current')).toBe('page');
  });

  it('the search box says what it does, shows the Ctrl K hint and opens the palette on a click', () => {
    const onOpen = vi.fn();
    frame({ commandBox: { onOpen } });
    const box = screen.getByRole('button', { name: /Search or jump to/ });
    expect(box.textContent).toContain('Ctrl K');
    expect(box.getAttribute('aria-keyshortcuts')).toBe('Control+K Meta+K');
    fireEvent.click(box);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('keeps the title as the page heading (visually hidden: the breadcrumb is what is seen)', () => {
    frame({ crumb: { section: 'Map' } });
    expect(screen.getByRole('heading', { level: 1, name: 'ORN' })).not.toBeNull();
  });
});

describe('skip link', () => {
  it('is the first focusable element and moves the focus into the main area', () => {
    frame();
    const link = screen.getByRole('link', { name: 'Skip to content' });
    const focusable = [...document.querySelectorAll<HTMLElement>('a[href], button, [tabindex="0"]')];
    expect(focusable[0]).toBe(link);
    fireEvent.click(link);
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });
});
