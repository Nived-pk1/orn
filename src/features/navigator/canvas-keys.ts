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

/** What each intent does, in words (the shortcuts sheet; step 8.4g Part B, G5). Data: a new intent needs a line here, and a test says so. */
export const CANVAS_INTENT_WORDS: Readonly<Record<CanvasIntent['type'], string>> = {
  move: 'Move between families',
  tab: 'Go to the next or the previous family',
  enter: 'Select the focused family',
  page: 'Open the page of the focused family',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fit: 'Show the whole map',
  centre: 'Centre the map on the focused family',
  escape: 'Close what is open, or step back',
  toggle: 'Add or remove the focused family in the selection (Studio)',
  menu: 'Open the menu of the focused family',
};

const NONE = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
/** The keys the sheet tries, in the order it lists them: each is asked of `intentOfKey` itself, so the list can only say what the map really does. */
const PROBES: readonly { readonly show: string; readonly event: KeyLike }[] = [
  { show: '←', event: { ...NONE, key: 'ArrowLeft' } },
  { show: '→', event: { ...NONE, key: 'ArrowRight' } },
  { show: '↑', event: { ...NONE, key: 'ArrowUp' } },
  { show: '↓', event: { ...NONE, key: 'ArrowDown' } },
  { show: 'Tab', event: { ...NONE, key: 'Tab' } },
  { show: 'Shift+Tab', event: { ...NONE, key: 'Tab', shiftKey: true } },
  { show: 'Enter', event: { ...NONE, key: 'Enter' } },
  { show: 'O', event: { ...NONE, key: 'o' } },
  { show: 'E', event: { ...NONE, key: 'e' } },
  { show: '+', event: { ...NONE, key: '+' } },
  { show: '=', event: { ...NONE, key: '=' } },
  { show: '-', event: { ...NONE, key: '-' } },
  { show: '_', event: { ...NONE, key: '_' } },
  { show: '0', event: { ...NONE, key: '0' } },
  { show: 'F', event: { ...NONE, key: 'f' } },
  { show: 'Esc', event: { ...NONE, key: 'Escape' } },
  { show: 'Shift+Space', event: { ...NONE, key: ' ', shiftKey: true } },
  { show: 'Shift+F10', event: { ...NONE, key: 'F10', shiftKey: true } },
  { show: 'Menu key', event: { ...NONE, key: 'ContextMenu' } },
];

/** The map's keys, one line per thing they do (the shortcuts sheet). */
export function canvasShortcuts(): readonly { readonly label: string; readonly keys: readonly string[] }[] {
  const byType = new Map<CanvasIntent['type'], string[]>();
  for (const probe of PROBES) {
    const intent = intentOfKey(probe.event);
    if (intent !== undefined) byType.set(intent.type, [...(byType.get(intent.type) ?? []), probe.show]);
  }
  return (Object.keys(CANVAS_INTENT_WORDS) as CanvasIntent['type'][]).flatMap((type) => {
    const keys = byType.get(type);
    return keys === undefined ? [] : [{ label: CANVAS_INTENT_WORDS[type], keys }];
  });
}
