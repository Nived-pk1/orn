// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tour, TOUR_STEPS } from './tour';

afterEach(cleanup);

describe('Tour (step 8.4g Part B, G4)', () => {
  it('has three short coach marks, in the words of the brief', () => {
    expect(TOUR_STEPS.map((s) => s.text)).toEqual([
      'The Map shows every family. Tap one to see what it makes and what it is made from.',
      'Find any compound, reaction or reagent',
      'Press the star on any record to keep it here for revision.',
    ]);
  });

  it('shows one mark at a time; Next goes on; the last one says Done and finishes', () => {
    const finish = vi.fn();
    render(<Tour onFinish={finish} />);
    expect(screen.getByText((TOUR_STEPS[0] as { text: string }).text)).toBeTruthy();
    expect(screen.queryByText((TOUR_STEPS[1] as { text: string }).text)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText((TOUR_STEPS[1] as { text: string }).text)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText((TOUR_STEPS[2] as { text: string }).text)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(finish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it('Skip is on every mark, and Esc is Skip', () => {
    for (let step = 0; step < 3; step++) {
      const finish = vi.fn();
      render(<Tour onFinish={finish} />);
      for (let i = 0; i < step; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
      expect(finish).toHaveBeenCalledTimes(1);
      cleanup();
    }
    const finish = vi.fn();
    render(<Tour onFinish={finish} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it('is reachable by keyboard: the focus is on the mark\'s main button, and again on each new mark', () => {
    render(<Tour onFinish={() => undefined} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Done' }));
  });

  it('points at its target when the page has it, and still shows the words when it does not', () => {
    const target = document.createElement('button');
    target.setAttribute('aria-label', 'Search or jump to…');
    target.getBoundingClientRect = () => ({ top: 10, left: 100, width: 80, height: 30, right: 180, bottom: 40, x: 100, y: 10, toJSON: () => ({}) });
    document.body.append(target);
    render(<Tour onFinish={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('region', { name: 'Tour' }).getAttribute('data-anchored')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // "open-family" is not on the page
    expect(screen.getByText((TOUR_STEPS[2] as { text: string }).text)).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Tour' }).getAttribute('data-anchored')).toBe('false');
    target.remove();
  });
});

describe('placeMark', () => {
  it('goes under its element, above it when there is no room below, always inside the window; without an element it stands in the middle of the window', async () => {
    const { placeMark } = await import('./tour');
    const view = { width: 400, height: 800 };
    expect(placeMark({ top: 10, left: 100, width: 80, height: 30 }, view, 100)).toEqual({ top: 52, left: 8 + 0 + Math.max(0, 100 + 40 - 144 - 8) });
    expect(placeMark({ top: 700, left: 100, width: 80, height: 30 }, view, 100).top).toBe(588);
    expect(placeMark({ top: 10, left: 390, width: 80, height: 30 }, view, 100).left).toBe(104);
    expect(placeMark(undefined, view, 100)).toEqual({ top: 350, left: 56 }); // mid-screen: the bottom is the toast, the storage line and the tab bar
  });
});

describe('the marks always point at something on screen (step C, F1)', () => {
  const box = (el: HTMLElement): void => {
    el.getBoundingClientRect = () => ({ top: 100, left: 20, width: 80, height: 32, right: 100, bottom: 132, x: 20, y: 100, toJSON: () => ({}) });
  };
  const rail = (collapsed = false): void => {
    document.body.replaceChildren();
    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Modes');
    const labels = collapsed ? ['Map', 'Starred'] : ['Map', 'Starred'];
    for (const label of labels) {
      const b = document.createElement('button');
      b.textContent = label;
      box(b);
      nav.append(b);
    }
    const search = document.createElement('button');
    search.setAttribute('aria-label', 'Search');
    box(search);
    document.body.append(nav, search);
  };
  const anchoredAt = (step: number): string | null => {
    for (let i = 0; i < step; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    return screen.getByRole('region', { name: 'Tour' }).getAttribute('data-anchored');
  };
  it('on a desktop rail every mark is anchored (Map item, Search button, Starred item)', () => {
    for (const step of [0, 1, 2]) {
      rail();
      render(<Tour onFinish={() => undefined} />);
      expect(anchoredAt(step)).toBe('true');
      cleanup();
    }
  });
  it('on a phone the Map tab and the Starred tab are the anchors', () => {
    document.body.replaceChildren();
    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Home');
    for (const label of ['Chapters', 'Families', 'Map', 'Explore', 'Starred']) {
      const b = document.createElement('button');
      b.title = label;
      b.textContent = label;
      box(b);
      nav.append(b);
    }
    document.body.append(nav);
    for (const step of [0, 2]) {
      render(<Tour onFinish={() => undefined} />);
      expect(anchoredAt(step)).toBe('true');
      cleanup();
    }
  });
  it('an item that is missing points at the Expand button of the rail', () => {
    document.body.replaceChildren();
    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Modes');
    const expand = document.createElement('button');
    expand.setAttribute('aria-label', 'Expand');
    box(expand);
    nav.append(expand);
    document.body.append(nav);
    render(<Tour onFinish={() => undefined} />);
    expect(anchoredAt(0)).toBe('true');
  });
});
