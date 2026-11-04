// @vitest-environment jsdom
/**
 * The map on screen with a focus (step 8.2a, D1 to D5, D7), in jsdom over the own-data layout fixture: the quiet line with nothing focused,
 * no arrow until a family is focused, faded boxes that stay clickable, Esc and an empty click that leave the focus, the chapter select, and
 * the legend's Unclassified line. The real browser drawing is in tests/e2e/map-focus.spec.ts.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { documentToState } from '@/core/dataset';
import { navigatorRig } from '@/test-support/navigator-kit';
import { NavigatorCanvas } from './navigator-canvas';
import { NavigatorProvider } from './navigator-context';

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});
afterEach(cleanup);

const parsed = documentToState(JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/map-layout/map-layout.orn.json'), 'utf8')));
if (!parsed.ok) throw new Error('fixture');
const fixtureState = parsed.state;
const QUIET = 'Tap or click a family to see what it makes and what it is made from.';
const NAVIGATOR = /^Navigator: \d+ hubs?, \d+ arrows?$/;

async function show() {
  const rig = navigatorRig(createCanonicalStore({ initial: fixtureState, validateInitial: false }));
  render(
    <NavigatorProvider ports={rig.ports} active>
      <NavigatorCanvas />
    </NavigatorProvider>,
  );
  const drawing = await screen.findByRole('group', { name: NAVIGATOR }, { timeout: 20_000 });
  return { rig, drawing };
}
const edges = (root: Element): number => root.querySelectorAll('[data-layer="edges"] [data-edge-id]').length;

describe('the map with a focus', () => {
  it('opens quiet: the line says what to do, boxes only, no arrow, nothing faded', async () => {
    const { drawing } = await show();
    expect(screen.getByText(QUIET)).toBeTruthy();
    expect(edges(drawing)).toBe(0);
    expect(drawing.querySelectorAll('[data-node-id]').length).toBeGreaterThanOrEqual(20);
    expect(drawing.querySelector('[data-faded]')).toBeNull();
    expect(drawing.getAttribute('aria-label')).toMatch(/^Navigator: 20 hubs, 0 arrows$/);
  });

  it('a focused family draws only its own arrows, hides the line, fades the others, and the faded ones stay clickable', async () => {
    const { rig, drawing } = await show();
    act(() => rig.ui.map.getState().setFocus('cls_family-01'));
    expect(screen.queryByText(QUIET)).toBeNull();
    const drawn = [...drawing.querySelectorAll('[data-layer="edges"] [data-edge-id]')];
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.every((g) => g.getAttribute('data-from') === 'cls_family-01' || g.getAttribute('data-to') === 'cls_family-01')).toBe(true);
    expect(drawn.some((g) => g.getAttribute('data-stroke') === 'dashed')).toBe(true);
    const fadedBoxes = drawing.querySelectorAll('[data-node-id][data-faded]');
    expect(fadedBoxes.length).toBeGreaterThan(0);
    const one = fadedBoxes[0] as Element;
    expect(one.getAttribute('data-node-id')).toBeTruthy();
    expect(one.getAttribute('aria-label')).toBeTruthy();
    expect(drawing.querySelector('[data-node-id="cls_family-01"][data-faded]')).toBeNull();
  });

  it('a click on empty map and Esc leave the focus', async () => {
    const { rig, drawing } = await show();
    act(() => rig.ui.map.getState().setFocus('cls_family-01'));
    fireEvent.keyDown(drawing, { key: 'Escape' });
    expect(rig.ui.map.getState().focusId).toBeNull();
    act(() => rig.ui.map.getState().setFocus('cls_family-02'));
    act(() => rig.ui.map.getState().setFocus(null));
    expect(screen.getByText(QUIET)).toBeTruthy();
  });

  it('a chapter draws all of its arrows and hides the quiet line; All chapters puts the quiet map back', async () => {
    const { rig, drawing } = await show();
    const select = screen.getByRole('combobox', { name: 'Chapter' });
    expect([...(select as HTMLSelectElement).options].map((o) => o.text)).toEqual(['All chapters', 'Chapter 1', 'Chapter 2', 'Chapter 3']);
    fireEvent.change(select, { target: { value: 'top_chapter-1' } });
    expect(rig.ui.map.getState().chapterId).toBe('top_chapter-1');
    await screen.findByRole('group', { name: NAVIGATOR });
    await vi_waitFor(() => expect(edges(drawing)).toBeGreaterThan(5));
    expect(screen.queryByText(QUIET)).toBeNull();
    fireEvent.change(select, { target: { value: '' } });
    await vi_waitFor(() => expect(edges(drawing)).toBe(0));
    expect(screen.getByText(QUIET)).toBeTruthy();
  });

  it('the legend says what the lines mean and how many reactions lead to compounds in no family; Show brings Unclassified in', async () => {
    const { rig, drawing } = await show();
    const legend = screen.getByRole('list', { name: 'What the marks mean' });
    expect(within(legend).getByText(/solid line in the family's colour: what the family makes/)).toBeTruthy();
    expect(within(legend).getByText(/dashed dark line: what the family is made from/)).toBeTruthy();
    expect(legend.textContent).toMatch(/\d+ reactions lead to compounds that are in no family yet/);
    expect(drawing.querySelector('[data-box="unclassified"]')).toBeNull();
    fireEvent.click(within(legend).getByRole('button', { name: 'Show' }));
    expect(rig.ui.map.getState().showUnclassified).toBe(true);
    expect(drawing.querySelector('[data-box="unclassified"]')).not.toBeNull();
    expect(within(legend).getByRole('button', { name: 'Hide' })).toBeTruthy();
  });

  it('families with reactions inside say "n within the family" and no loop is drawn', async () => {
    const { rig, drawing } = await show();
    // (the caption text itself is drawn from LOD 1 on, which jsdom has no size for: the box's spoken name carries the same words)
    const spoken = [...drawing.querySelectorAll('[data-node-id]')].filter((g) => /, \d+ within the family$/.test(g.getAttribute('aria-label') ?? ''));
    expect(spoken.length).toBeGreaterThanOrEqual(4);
    act(() => rig.ui.map.getState().setChapter('top_chapter-1'));
    await vi_waitFor(() => expect(edges(drawing)).toBeGreaterThan(0));
    expect([...drawing.querySelectorAll('[data-layer="edges"] [data-edge-id]')].some((g) => g.getAttribute('data-from') === g.getAttribute('data-to'))).toBe(false);
  });
});

async function vi_waitFor(check: () => void): Promise<void> {
  const { waitFor } = await import('@testing-library/react');
  await waitFor(check, { timeout: 20_000 });
}
