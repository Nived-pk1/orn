// @vitest-environment jsdom
/** The map's focus state (step 8.2a, D1, D7): the locked focus, the 150 ms hover preview, the chapter and Unclassified choices, the saved chapter that is gone. */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Scene, SceneEdge, SceneNode } from '@/render/scene';
import { createNavigatorUiStores } from '@/ui/state';
import { manualTimers } from '@/test-support/navigator-kit';
import { HOVER_FOCUS_MS, useMapView } from './use-map-view';

const node = (id: string, x: number): SceneNode => ({ id, glyph: 'class_hub', box: 'hub', x, y: 0, width: 100, height: 40, label: [{ text: id }], badges: [], emphasis: 'anchor', state: { dimmed: false, onPath: false }, minLod: 0, ariaLabel: id, group: 'G', tone: 'blue' });
const edge = (id: string, from: string, to: string): SceneEdge => ({ id, from, to, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], semantic: 'produces', stroke: 'solid', weight: 'normal', arrowHead: 'filled', labelAt: { x: 5, y: 0 }, minLod: 0, ariaLabel: id } as SceneEdge);
const scene: Scene = { revision: 1, projectionKey: 'k', layoutKey: 'l', nodes: [node('a', 0), node('b', 200), node('c', 400)], edges: [edge('ab', 'a', 'b'), edge('bc', 'b', 'c')], bounds: { width: 500, height: 40 }, truncation: null };

function setup(options: { chapters?: readonly string[]; saved?: string | null } = {}) {
  const ui = createNavigatorUiStores();
  const timers = manualTimers();
  if (options.saved !== undefined) ui.map.getState().setChapter(options.saved);
  const said: string[] = [];
  const hook = renderHook(() => useMapView({ ui, timers, scene, isHub: () => true, selected: null, chapters: options.chapters ?? ['top_a'], announce: (m: string) => said.push(m) }));
  return { ui, timers, hook, said };
}

describe('useMapView', () => {
  it('opens quiet: nothing focused, no arrow drawn', () => {
    const { hook } = setup();
    expect(hook.result.current.view?.quiet).toBe(true);
    expect(hook.result.current.view?.scene.edges).toEqual([]);
  });

  it('a locked focus draws that family\'s arrows', () => {
    const { hook, ui } = setup();
    act(() => ui.map.getState().setFocus('b'));
    expect(hook.result.current.view?.scene.edges.map((e) => e.id).sort()).toEqual(['ab', 'bc']);
  });

  it('hover previews the focus after 150 ms and moving away restores the locked focus (or none)', () => {
    const { hook, ui, timers } = setup();
    act(() => hook.result.current.onNodeHover('a'));
    act(() => timers.advance(HOVER_FOCUS_MS - 1));
    expect(hook.result.current.view?.scene.edges).toEqual([]);
    act(() => timers.advance(1));
    expect(hook.result.current.view?.scene.edges.map((e) => e.id)).toEqual(['ab']);
    act(() => hook.result.current.onNodeHover(null));
    expect(hook.result.current.view?.quiet).toBe(true);
    act(() => ui.map.getState().setFocus('c'));
    act(() => hook.result.current.onNodeHover('a'));
    act(() => timers.advance(HOVER_FOCUS_MS));
    expect(hook.result.current.view?.scene.edges.map((e) => e.id)).toEqual(['ab']);
    act(() => hook.result.current.onNodeHover(null));
    expect(hook.result.current.view?.scene.edges.map((e) => e.id)).toEqual(['bc']);
  });

  it('a pointer that leaves before 150 ms previews nothing', () => {
    const { hook, timers } = setup();
    act(() => hook.result.current.onNodeHover('a'));
    act(() => hook.result.current.onNodeHover(null));
    act(() => timers.advance(500));
    expect(hook.result.current.view?.quiet).toBe(true);
    expect(timers.pending()).toBe(0);
  });

  it('a chosen chapter draws all of its arrows', () => {
    const { hook, ui } = setup();
    act(() => ui.map.getState().setChapter('top_a'));
    expect(hook.result.current.chapterId).toBe('top_a');
    expect(hook.result.current.view?.scene.edges).toHaveLength(2);
  });

  it('a saved chapter that no longer exists is dropped and said (never a silent empty map)', () => {
    const { hook, ui, said } = setup({ saved: 'top_gone', chapters: ['top_a'] });
    expect(ui.map.getState().chapterId).toBeNull();
    expect(hook.result.current.chapterId).toBeNull();
    expect(said.join(' ')).toMatch(/chapter .* no longer exists|showing all chapters/i);
  });

  it('Unclassified follows the saved choice', () => {
    const { hook, ui } = setup();
    expect(hook.result.current.showUnclassified).toBe(false);
    act(() => ui.map.getState().setShowUnclassified(true));
    expect(hook.result.current.showUnclassified).toBe(true);
  });
});
