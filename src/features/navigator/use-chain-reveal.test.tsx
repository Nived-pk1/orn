// @vitest-environment jsdom
/** The chain reveal on a phone (step 8.3b, B2.1): the drawing is placed above the sheet, and again when the sheet changes height (a card chosen, "Show all"). */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from '@/render/scene';
import type { ViewportController } from '@/render/viewport';
import { useChainReveal } from './use-chain-reveal';

let notify: (() => void) | undefined;
class FakeObserver {
  constructor(private readonly run: () => void) {}
  observe(): void {
    notify = this.run;
  }
  disconnect(): void {
    notify = undefined;
  }
}
beforeEach(() => vi.stubGlobal('ResizeObserver', FakeObserver));
afterEach(() => vi.unstubAllGlobals());

function rig(sheetHeight: { value: number }) {
  const panel = document.createElement('aside');
  panel.setAttribute('aria-label', 'From A to B');
  panel.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 400, bottom: sheetHeight.value, width: 400, height: sheetHeight.value, toJSON: () => ({}) });
  const root = document.createElement('div');
  root.append(panel);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 400, bottom: 800, width: 400, height: 800, toJSON: () => ({}) });
  const scene = { nodes: [{ id: 'a', x: 0, y: 600, width: 100, height: 50 }, { id: 'b', x: 200, y: 600, width: 100, height: 50 }] } as unknown as Scene;
  const controller = { current: () => ({ x: 0, y: 0, scale: 1 }), setViewport: vi.fn() } as unknown as ViewportController;
  return { root: { current: root }, svg, scene, controller };
}

describe('useChainReveal', () => {
  it('moves the drawing above the sheet, and again when the sheet changes height', async () => {
    const height = { value: 200 };
    const { root, svg, scene, controller } = rig(height);
    renderHook(() => useChainReveal({ phone: true, chain: [{ from: 'a', to: 'b' }], svg, root, scene, controller }));
    await waitFor(() => expect(controller.setViewport).toHaveBeenCalledTimes(1));
    height.value = 380;
    act(() => notify?.());
    await waitFor(() => expect(controller.setViewport).toHaveBeenCalledTimes(2));
  });
  it('does nothing on a wide screen or with no chain', () => {
    const { root, svg, scene, controller } = rig({ value: 200 });
    renderHook(() => useChainReveal({ phone: false, chain: [{ from: 'a', to: 'b' }], svg, root, scene, controller }));
    renderHook(() => useChainReveal({ phone: true, chain: undefined, svg, root, scene, controller }));
    expect(controller.setViewport).not.toHaveBeenCalled();
  });
});
