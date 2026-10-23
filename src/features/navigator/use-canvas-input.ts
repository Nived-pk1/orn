/**
 * Keyboard, pointer and context menu of the overview map (step 5.7, items d to g). The drawing is ONE tab stop that keeps the DOM
 * focus; the family that "has the focus" is `aria-activedescendant` of the drawing (decision in docs/PROGRESS.md, step 5.7 part 1),
 * so moving it re-renders the overlay and nothing else. This hook holds the focus, the Enter-again memory and the open menu; the
 * keys are `canvas-keys.ts`, the nearest-family and reading-order functions are `render/scene/navigation.ts`, the menu is
 * `canvas-menu.ts`. Every outcome is a store command (selection, family) or a viewport command; nothing here is chemistry.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent } from 'react';
import { firstFamily, lastFamily, neighbourInDirection, stepInReadingOrder, type Scene } from '@/render/scene';
import type { SceneHit, SceneSvgProps } from '@/render/svg';
import type { PointerHandlers, ViewportController } from '@/render/viewport';
import type { NavigatorUiStores } from '@/ui/state';
import { canvasMenuOf, nameOf, type CanvasMenu, type MenuAction } from './canvas-menu';
import { intentOfKey } from './canvas-keys';
import type { MultiSelect } from './multi-types';
import { viewportToReveal } from './reveal';

export interface OpenMenu {
  readonly at: { readonly x: number; readonly y: number };
  readonly menu: CanvasMenu;
}

export interface CanvasInput {
  readonly keyboard: NonNullable<SceneSvgProps['keyboard']>;
  readonly pointer: PointerHandlers;
  /** The family the focus ring is drawn on: only while the drawing has the keyboard focus. */
  readonly ringId: string | undefined;
  readonly menu: OpenMenu | null;
  readonly closeMenu: () => void;
  readonly closeMenuFocus: () => void;
  readonly run: (action: MenuAction) => void;
}

interface Args {
  readonly ui: NavigatorUiStores;
  readonly scene: Scene | null;
  readonly isHub: (id: string) => boolean;
  readonly controller: ViewportController | null;
  readonly svg: SVGSVGElement | null;
  readonly announce: (message: string) => void;
  /** Studio's multi-selection (step 6.8b); absent in Study, where Shift means nothing. */
  readonly multi?: MultiSelect | null;
  /** The family whose page was just closed: where the keyboard focus lands when the drawing takes it. */
  readonly returnTo?: string;
}

interface FocusState {
  readonly id: string | undefined;
  readonly ring: boolean;
  readonly inside: boolean;
}

/** The id when it is a family of the Scene (what the keyboard moves between). */
const familyId = (id: string | undefined, scene: Scene | null): string | undefined =>
  id !== undefined && scene !== null && scene.nodes.some((node) => node.id === id && (node.box === 'hub' || node.box === 'unclassified')) ? id : undefined;

export function useCanvasInput(args: Args): CanvasInput {
  const { ui, scene, isHub, controller, svg, announce } = args;
  const [focus, setFocus] = useState<FocusState>({ id: undefined, ring: false, inside: false });
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const multi = args.multi ?? null;
  const live = useRef({ scene, isHub, controller, svg, announce, focus, multi });
  live.current = { scene, isHub, controller, svg, announce, focus, multi };
  const last = useRef<string | undefined>(args.returnTo);
  const armed = useRef<string | undefined>(undefined);
  // Was the last thing a press on the drawing (a mouse or finger focus) rather than a key or a program? A press names no family and draws no ring.
  const pressed = useRef(false);
  useEffect(() => {
    if (svg === null) return undefined;
    const press = (): void => void (pressed.current = true);
    const key = (): void => void (pressed.current = false);
    svg.addEventListener('pointerdown', press, true);
    svg.addEventListener('keydown', key, true);
    return () => {
      svg.removeEventListener('pointerdown', press, true);
      svg.removeEventListener('keydown', key, true);
    };
  }, [svg]);

  const openPage = useCallback(
    (id: string): void => {
      const { isHub: hub, scene: current, announce: say } = live.current;
      if (hub(id)) return ui.family.getState().openFamily(id);
      const node = current?.nodes.find((candidate) => candidate.id === id);
      say(`${node === undefined ? 'This' : nameOf(node)} has no family page`);
    },
    [ui],
  );

  const inspect = useCallback(
    (hit: SceneHit): void => {
      ui.selection.getState().select(hit);
      ui.selection.getState().reveal();
    },
    [ui],
  );

  const run = useCallback(
    (action: MenuAction): void => {
      const view = live.current.controller;
      switch (action.type) {
        case 'openPage':
          return openPage(action.hubId);
        case 'openGroup':
          return ui.family.getState().openFamily(action.from, { section: 'reactions_of', hubId: action.to });
        case 'inspect':
          return inspect(action.hit);
        case 'zoomIn':
          return view?.zoomIn();
        case 'zoomOut':
          return view?.zoomOut();
        case 'fit':
          return view?.fit();
      }
    },
    [inspect, openPage, ui],
  );

  /** Moves the focus to a family and brings it into the window at the same scale. */
  const moveTo = (id: string | undefined, element: SVGSVGElement): void => {
    if (id === undefined) return;
    last.current = id;
    armed.current = undefined;
    setFocus({ id, ring: true, inside: true });
    const { scene: current, controller: view } = live.current;
    const node = current?.nodes.find((candidate) => candidate.id === id);
    if (node === undefined || view === null) return;
    const box = element.getBoundingClientRect();
    const next = viewportToReveal(view.current(), { width: box.width, height: box.height }, node);
    if (next !== undefined) view.setViewport(next);
  };

  /** Where a menu for this family opens: the middle of its box on the screen (the middle of the drawing for none). */
  const screenPointOf = (id: string | undefined, element: SVGSVGElement): { x: number; y: number } => {
    const { scene: current, controller: view } = live.current;
    const box = element.getBoundingClientRect();
    const node = id === undefined ? undefined : current?.nodes.find((candidate) => candidate.id === id);
    if (node === undefined || view === null) return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    const at = view.current();
    return { x: box.left + (node.x + node.width / 2) * at.scale + at.x, y: box.top + (node.y + node.height / 2) * at.scale + at.y };
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>): void => {
    if (event.target !== event.currentTarget) return;
    const { scene: current, focus: now, controller: view } = live.current;
    const intent = intentOfKey(event);
    if (intent === undefined || current === null) return;
    const element = event.currentTarget;
    const id = familyId(now.id, current);
    const handled = (): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    const selected = ui.selection.getState().selected;
    const target = id ?? (selected !== null && selected.kind === 'node' ? selected.id : undefined);
    switch (intent.type) {
      case 'move': {
        handled();
        if (id === undefined) return moveTo(firstFamily(current), element);
        const next = neighbourInDirection(current, id, intent.direction);
        if (next !== undefined) return moveTo(next, element);
        setFocus({ ...now, ring: true });
        return announce(`No family ${intent.direction === 'up' ? 'above' : intent.direction === 'down' ? 'below' : `to the ${intent.direction}`}`);
      }
      case 'tab': {
        const next = id === undefined ? (intent.delta === 1 ? firstFamily(current) : lastFamily(current)) : stepInReadingOrder(current, id, intent.delta);
        if (next === undefined) return; // past either end: the browser moves on and the focus leaves the canvas
        handled();
        return moveTo(next, element);
      }
      case 'enter': {
        handled();
        if (id === undefined) return;
        if (armed.current === id && selected !== null && selected.kind === 'node' && selected.id === id) return openPage(id);
        inspect({ kind: 'node', id });
        armed.current = id;
        return setFocus({ ...now, ring: true });
      }
      case 'page':
        handled();
        return target === undefined ? announce('Move to a family first, then press O to open its page') : openPage(target);
      case 'zoomIn':
        handled();
        return view?.zoomIn();
      case 'zoomOut':
        handled();
        return view?.zoomOut();
      case 'fit':
        handled();
        return view?.fit();
      case 'centre':
        handled();
        if (target === undefined || view === null) return announce('Move to a family first, then press F to centre it');
        view.focus([target]);
        return;
      case 'toggle':
        if (live.current.multi === null) return; // Study: nothing acts on a multi-selection
        handled();
        return live.current.multi.toggleFocused(id);
      case 'escape':
        if (live.current.multi !== null && live.current.multi.items.length > 0) {
          handled();
          live.current.multi.clear();
          return announce('Selection cleared');
        }
        if (selected === null) return; // nothing of ours to close: Esc goes on to the layers around the canvas
        handled();
        armed.current = undefined;
        ui.selection.getState().select(null);
        return announce('Selection cleared');
      case 'menu': {
        handled();
        const hit: SceneHit | null = id === undefined ? null : { kind: 'node', id };
        return setMenu({ at: screenPointOf(id, element), menu: canvasMenuOf(current, hit, live.current.isHub) });
      }
    }
  };

  const onFocus = (event: FocusEvent<SVGSVGElement>): void => {
    if (event.target !== event.currentTarget) return;
    const current = live.current.scene;
    const id = familyId(last.current, current) ?? (current === null ? undefined : firstFamily(current));
    last.current = id;
    // a press that focused the drawing (a mouse click or drag) names no family and mutates nothing; a key or a program does
    const keyboard = !pressed.current;
    setFocus({ id, ring: keyboard, inside: keyboard });
  };
  const onBlur = (event: FocusEvent<SVGSVGElement>): void => {
    if (event.target !== event.currentTarget) return;
    setFocus((now) => ({ ...now, ring: false, inside: false }));
  };

  const enabled = multi !== null;
  const pointer = useMemo<PointerHandlers>(
    () => ({
      onClick(hit) {
        const { scene: current, svg: element, multi: many } = live.current;
        armed.current = undefined;
        if (many !== null && many.selectMode) {
          // the phone's Select mode: a tap toggles the item under it; a tap on nothing changes nothing
          if (hit !== null) many.toggle(hit);
          return;
        }
        ui.selection.getState().select(hit);
        element?.focus({ preventScroll: true });
        const id = hit !== null && hit.kind === 'node' ? familyId(hit.id, current) : undefined;
        if (id === undefined) return;
        last.current = id;
        setFocus({ id, ring: false, inside: true });
      },
      onDoubleClick(hit) {
        if (live.current.multi?.selectMode === true) return;
        if (hit !== null && hit.kind === 'node' && live.current.isHub(hit.id)) ui.family.getState().openFamily(hit.id);
      },
      onConfirm(hit) {
        if (live.current.multi?.selectMode === true) return;
        if (hit !== null) ui.selection.getState().reveal();
      },
      onContextMenu(hit, point) {
        const { scene: current, isHub: hub } = live.current;
        if (current === null) return;
        if (hit !== null) ui.selection.getState().select(hit);
        setMenu({ at: point, menu: canvasMenuOf(current, hit, hub) });
      },
      ...(enabled
        ? {
            onToggle: (hit) => live.current.multi?.toggle(hit),
            onMarquee: (rect, done) => live.current.multi?.onMarquee(rect, done),
            onMarqueeCancel: () => live.current.multi?.onMarqueeCancel(),
          }
        : {}),
    }),
    [ui, enabled],
  );

  const closeMenu = useCallback((): void => setMenu(null), []);
  const closeMenuFocus = useCallback((): void => live.current.svg?.focus({ preventScroll: true }), []);
  const active = focus.inside ? familyId(focus.id, scene) : undefined;
  return { keyboard: { activeId: active, onKeyDown, onFocus, onBlur }, pointer, ringId: focus.ring ? active : undefined, menu, closeMenu, closeMenuFocus, run };
}
