// @vitest-environment jsdom
/** What a click, a tap, Enter and Esc do to the map's focus (step 8.2a, D1): the selection behaviour of 5.7 stays, the focus follows it. */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Scene, SceneNode } from '@/render/scene';
import { createNavigatorUiStores } from '@/ui/state';
import { useCanvasInput } from './use-canvas-input';

const node = (id: string, x: number): SceneNode => ({ id, glyph: 'class_hub', box: 'hub', x, y: 0, width: 100, height: 40, label: [{ text: id }], badges: [], emphasis: 'anchor', state: { dimmed: false, onPath: false }, minLod: 0, ariaLabel: id });
const scene: Scene = { revision: 1, projectionKey: 'k', layoutKey: 'l', nodes: [node('a', 0), node('b', 200)], edges: [], bounds: { width: 300, height: 40 }, truncation: null };

function setup() {
  const ui = createNavigatorUiStores();
  const hook = renderHook(() => useCanvasInput({ ui, scene, isHub: () => true, controller: null, svg: null, announce: vi.fn() }));
  return { ui, hook };
}
const keyEvent = (key: string) => {
  const target = {};
  return { key, target, currentTarget: target, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault: () => undefined, stopPropagation: () => undefined } as never;
};

describe('the focus follows a click', () => {
  it('a click or tap on a family selects it as before and focuses it', () => {
    const { ui, hook } = setup();
    act(() => hook.result.current.pointer.onClick?.({ kind: 'node', id: 'a' }));
    expect(ui.selection.getState().selected).toEqual({ kind: 'node', id: 'a' });
    expect(ui.map.getState().focusId).toBe('a');
    act(() => hook.result.current.pointer.onClick?.({ kind: 'node', id: 'b' }));
    expect(ui.map.getState().focusId).toBe('b');
  });

  it('a click on an arrow keeps the focus (and selects the arrow, as before)', () => {
    const { ui, hook } = setup();
    act(() => hook.result.current.pointer.onClick?.({ kind: 'node', id: 'a' }));
    act(() => hook.result.current.pointer.onClick?.({ kind: 'edge', id: 'e1' }));
    expect(ui.selection.getState().selected).toEqual({ kind: 'edge', id: 'e1' });
    expect(ui.map.getState().focusId).toBe('a');
  });

  it('a click on empty map clears the focus and the selection', () => {
    const { ui, hook } = setup();
    act(() => hook.result.current.pointer.onClick?.({ kind: 'node', id: 'a' }));
    act(() => hook.result.current.pointer.onClick?.(null));
    expect(ui.map.getState().focusId).toBeNull();
    expect(ui.selection.getState().selected).toBeNull();
  });
});

describe('Esc', () => {
  it('clears the focus and the selection', () => {
    const { ui, hook } = setup();
    act(() => hook.result.current.pointer.onClick?.({ kind: 'node', id: 'a' }));
    act(() => hook.result.current.keyboard.onKeyDown(keyEvent('Escape')));
    expect(ui.map.getState().focusId).toBeNull();
    expect(ui.selection.getState().selected).toBeNull();
  });

  it('clears a focus even when nothing is selected (a chosen focus must always be left with Esc)', () => {
    const { ui, hook } = setup();
    act(() => ui.map.getState().setFocus('b'));
    act(() => hook.result.current.keyboard.onKeyDown(keyEvent('Escape')));
    expect(ui.map.getState().focusId).toBeNull();
  });

  it('with no focus and no selection Esc is left to the layers around the map', () => {
    const { hook } = setup();
    let stopped = false;
    const event = { ...(keyEvent('Escape') as object), stopPropagation: () => void (stopped = true) } as never;
    act(() => hook.result.current.keyboard.onKeyDown(event));
    expect(stopped).toBe(false);
  });
});
