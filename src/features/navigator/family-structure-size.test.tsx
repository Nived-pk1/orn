// @vitest-environment jsdom
/**
 * Step 8.5e: the Structure box asks for its drawing at the family standard (labels set apart from the bond length), and a sideways-scrolling box opens
 * the structure full size in the inspector on a click or a tap (E2 b).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDepictionManager } from '@/render/svg';
import { SIZE_RULES } from '@/render/equation';
import { manualTimers } from '@/test-support/navigator-kit';
import { FamilyEnvContext, type FamilyEnv } from './family-env';
import { Structure } from './family-structure';

afterEach(cleanup);
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
});

const REF = { kind: 'species', id: 'sp-wide' } as never;

function setup(width: number, open?: FamilyEnv['openStructure'], more: { readonly allAtoms?: boolean; readonly inScheme?: boolean } = {}) {
  const timers = manualTimers();
  const manager = createDepictionManager({ fetchSvg: () => Promise.resolve({ ok: true, svg: '<svg/>', width, height: 100, ...(more.allAtoms === undefined ? {} : { allAtoms: more.allAtoms }) }), createUrl: () => 'blob:drawn', revokeUrl: () => undefined, setTimer: (cb, ms) => timers.after(ms, cb), clearTimer: (h) => (h as () => void)(), isPending: () => false });
  const asked: (number | undefined)[] = [];
  const env: FamilyEnv = { describe: () => ({ name: 'Wide' }), keyOf: (_ref, bondPx) => (asked.push(bondPx), 'key-wide'), manager, timers, ...(open === undefined ? {} : { openStructure: open }) };
  const box = <Structure substance={REF} />;
  render(<FamilyEnvContext.Provider value={env}>{more.inScheme === true ? <div data-scheme="">{<div>{box}</div>}</div> : box}</FamilyEnvContext.Provider>);
  return { asked };
}

describe('Structure box at the family standard (8.5e)', () => {
  it('asks for the drawing at the family bond length', async () => {
    const { asked } = setup(100);
    await screen.findByRole('img', { name: 'Structure of Wide' });
    expect(asked[0]).toBe(SIZE_RULES.family.standard);
  });

  it('a drawing that fits is not a button: no click target', async () => {
    const opened = vi.fn();
    setup(100, opened);
    const img = await screen.findByRole('img', { name: 'Structure of Wide' });
    fireEvent.click(img);
    expect(opened).not.toHaveBeenCalled();
    expect(document.querySelector('[data-scrolls]')).toBeNull();
  });

  it('a click, Enter or Space on a scrolling box opens that structure in the inspector', async () => {
    const opened = vi.fn();
    setup(4000, opened);
    await screen.findByRole('img', { name: 'Structure of Wide' });
    const box = document.querySelector('[data-scrolls]') as HTMLElement;
    expect(box).not.toBeNull();
    fireEvent.click(box);
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.keyDown(box, { key: ' ' });
    expect(opened).toHaveBeenCalledTimes(3);
    expect(opened).toHaveBeenCalledWith(REF);
    expect(box.getAttribute('role')).toBe('button');
    expect(box.getAttribute('aria-label')).toBe('Open the structure of Wide full size in the inspector');
  });
});

const CROWDED = 'Too crowded with all atoms; shown condensed';

describe('Full mode and the card (8.5g B)', () => {
  it('a drawing with all atoms is shown at the Full standard (1.4 x the family standard), with no extra line', async () => {
    setup(100, undefined, { allAtoms: true });
    const img = await screen.findByRole('img', { name: 'Structure of Wide' });
    expect(Number(img.getAttribute('data-bond-px'))).toBeCloseTo(SIZE_RULES.family.standard * 1.4, 1);
    expect(screen.queryByText(CROWDED)).toBeNull();
  });

  it('a structure too crowded for all atoms says so under the picture and in its text alternative, at the family standard', async () => {
    setup(100, undefined, { allAtoms: false });
    const img = await screen.findByRole('img', { name: `Structure of Wide. ${CROWDED}` });
    expect(Number(img.getAttribute('data-bond-px'))).toBe(SIZE_RULES.family.standard);
    expect(screen.getByText(CROWDED)).toBeTruthy();
  });

  it('may use the width of its whole scheme, not only of the column it sits in: no scroll box while the card has room', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute('data-scheme') ? 900 : 120;
    });
    setup(600, undefined, { inScheme: true });
    const img = await screen.findByRole('img', { name: 'Structure of Wide' });
    expect(Number(img.getAttribute('width'))).toBe(Math.round((600 * SIZE_RULES.family.standard) / 54));
    expect(document.querySelector('[data-scrolls]')).toBeNull();
  });
});
