/**
 * The canvas keyboard map (step 5.7, item f; UI_ARCHITECTURE section 10, adapted by ADR-037): a key event in, an intent out, nothing
 * else. Pure, so the whole map is a table test. Alt+Left / Alt+Right (the inspector history) and every Ctrl / Meta shortcut belong
 * to other owners and are not canvas intents. `E` is an alias of `O` (what expanding a family once did is opening its page now);
 * `C` (collapse) has no meaning any more and is not bound.
 */
import type { Direction } from '@/render/scene';

export type CanvasIntent =
  | { readonly type: 'move'; readonly direction: Direction }
  | { readonly type: 'tab'; readonly delta: 1 | -1 }
  | { readonly type: 'enter' }
  | { readonly type: 'page' }
  | { readonly type: 'zoomIn' }
  | { readonly type: 'zoomOut' }
  | { readonly type: 'fit' }
  | { readonly type: 'centre' }
  | { readonly type: 'escape' }
  /** Shift+Space: toggles the focused item in the multi-selection (Studio; step 6.8b). */
  | { readonly type: 'toggle' }
  | { readonly type: 'menu' };

export interface KeyLike {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

const ARROWS: Readonly<Record<string, Direction>> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

export function intentOfKey(event: KeyLike): CanvasIntent | undefined {
  if (event.altKey || event.ctrlKey || event.metaKey) return undefined;
  if (event.key === ' ') return event.shiftKey ? { type: 'toggle' } : undefined;
  if (event.key === 'F10') return event.shiftKey ? { type: 'menu' } : undefined;
  if (event.key === 'ContextMenu') return { type: 'menu' };
  if (event.key === 'Tab') return { type: 'tab', delta: event.shiftKey ? -1 : 1 };
  const direction = ARROWS[event.key];
  if (direction !== undefined) return event.shiftKey ? undefined : { type: 'move', direction };
  switch (event.key) {
    case 'Enter':
      return { type: 'enter' };
    case 'Escape':
      return { type: 'escape' };
    case '+':
    case '=':
      return { type: 'zoomIn' };
    case '-':
    case '_':
      return { type: 'zoomOut' };
    case '0':
      return { type: 'fit' };
    case 'f':
    case 'F':
      return { type: 'centre' };
    case 'o':
    case 'O':
    case 'e':
    case 'E':
      return { type: 'page' };
    default:
      return undefined;
  }
}
