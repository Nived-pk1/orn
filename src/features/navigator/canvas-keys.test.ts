/** The canvas keyboard map as a table (step 5.7, item f). */
import { describe, expect, it } from 'vitest';
import { intentOfKey, type CanvasIntent, type KeyLike } from './canvas-keys';

const key = (name: string, mods: Partial<KeyLike> = {}): KeyLike => ({ key: name, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...mods });

const TABLE: ReadonlyArray<readonly [string, KeyLike, CanvasIntent | undefined]> = [
  ['arrow left', key('ArrowLeft'), { type: 'move', direction: 'left' }],
  ['arrow right', key('ArrowRight'), { type: 'move', direction: 'right' }],
  ['arrow up', key('ArrowUp'), { type: 'move', direction: 'up' }],
  ['arrow down', key('ArrowDown'), { type: 'move', direction: 'down' }],
  ['Tab', key('Tab'), { type: 'tab', delta: 1 }],
  ['Shift+Tab', key('Tab', { shiftKey: true }), { type: 'tab', delta: -1 }],
  ['Enter', key('Enter'), { type: 'enter' }],
  ['O opens the family page', key('o'), { type: 'page' }],
  ['capital O', key('O', { shiftKey: true }), { type: 'page' }],
  ['E is an alias of O', key('e'), { type: 'page' }],
  ['+', key('+', { shiftKey: true }), { type: 'zoomIn' }],
  ['= (the unshifted + key)', key('='), { type: 'zoomIn' }],
  ['-', key('-'), { type: 'zoomOut' }],
  ['0', key('0'), { type: 'fit' }],
  ['F', key('f'), { type: 'centre' }],
  ['Escape', key('Escape'), { type: 'escape' }],
  ['Shift+F10', key('F10', { shiftKey: true }), { type: 'menu' }],
  ['the context-menu key', key('ContextMenu'), { type: 'menu' }],
  ['F10 alone is not ours', key('F10'), undefined],
  ['C (collapse) is not bound', key('c'), undefined],
  ['Alt+Left belongs to the inspector history', key('ArrowLeft', { altKey: true }), undefined],
  ['Alt+Right belongs to the inspector history', key('ArrowRight', { altKey: true }), undefined],
  ['Ctrl+0 is the browser\'s', key('0', { ctrlKey: true }), undefined],
  ['Ctrl+K is not ours', key('k', { ctrlKey: true }), undefined],
  ['Cmd+Z is not ours', key('z', { metaKey: true }), undefined],
  ['Shift+arrow (a marquee) is not bound in Phase 5', key('ArrowRight', { shiftKey: true }), undefined],
  ['a letter with no meaning', key('x'), undefined],
];

describe('the canvas keyboard map', () => {
  it.each(TABLE)('%s', (_name, event, intent) => {
    expect(intentOfKey(event)).toEqual(intent);
  });
});
