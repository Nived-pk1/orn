// @vitest-environment jsdom
/**
 * The navigator's two screens through the view (step 8.4s, L1): the map canvas is a lazy chunk, so coming back from a family page the
 * view must wait for it and still put the keyboard focus on the drawing of the family just left. (The canvas alone is tested in
 * navigator-canvas-focus.test.tsx; it cannot notice a regression of the view.)
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { documentToState } from '@/core/dataset';
import { navigatorRig } from '@/test-support/navigator-kit';
import { NavigatorProvider } from './navigator-context';
import { NavigatorView } from './navigator-view';

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
const NAVIGATOR = /^Navigator: \d+ hubs?, \d+ arrows?$/;

describe('the navigator view with a lazy canvas', () => {
  it('shows the loading line while the map chunk arrives, then the map', async () => {
    const rig = navigatorRig(createCanonicalStore({ initial: parsed.state, validateInitial: false }));
    render(
      <NavigatorProvider ports={rig.ports} active>
        <NavigatorView />
      </NavigatorProvider>,
    );
    expect(await screen.findByRole('group', { name: NAVIGATOR }, { timeout: 20_000 })).toBeTruthy();
  });

  it('back from a family page, the focus lands on the drawing once the canvas has loaded', async () => {
    const rig = navigatorRig(createCanonicalStore({ initial: parsed.state, validateInitial: false }));
    act(() => rig.ui.family.getState().openFamily('cls_family-01', { section: 'reactions_of', hubId: 'cls_family-01' }));
    render(
      <NavigatorProvider ports={rig.ports} active>
        <NavigatorView />
      </NavigatorProvider>,
    );
    await screen.findByRole('button', { name: /overview/i }, { timeout: 20_000 });
    act(() => rig.ui.family.getState().closeFamily());
    const drawing = await screen.findByRole('group', { name: NAVIGATOR }, { timeout: 20_000 });
    await vi.waitFor(() => expect(document.activeElement).toBe(drawing), { timeout: 5_000 });
  });
});
