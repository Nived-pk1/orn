/** The words of a map selection (step 8.3, C6): Studio keeps the full accessible name; Study says the record's name only. The line and the live region share them. */
import { describe, expect, it } from 'vitest';
import type { Scene } from '@/render/scene';
import { selectionWordsOf } from './selection-words';

const scene = {
  nodes: [
    { id: 'cls_alcohols', label: [{ text: 'Alcohols' }], ariaLabel: 'Alcohols, class hub, 3 reactions out, 1 reaction in' },
    { id: 'cls_aldehydes', label: [{ text: 'Aldehydes' }], ariaLabel: 'Aldehydes, class hub, 1 reaction in' },
  ],
  edges: [{ id: 'e1', from: 'cls_alcohols', to: 'cls_aldehydes', ariaLabel: 'Alcohols to Aldehydes, 2 reactions (+ 1 example)' }],
} as unknown as Scene;

describe('selectionWordsOf', () => {
  it('Studio: the full accessible name, as before', () => {
    expect(selectionWordsOf(scene, { kind: 'node', id: 'cls_alcohols' }, 'full')).toBe('Alcohols, class hub, 3 reactions out, 1 reaction in');
    expect(selectionWordsOf(scene, { kind: 'edge', id: 'e1' }, 'full')).toBe('Alcohols to Aldehydes, 2 reactions (+ 1 example)');
  });
  it('Study: the name only, with no kind words and no counts', () => {
    expect(selectionWordsOf(scene, { kind: 'node', id: 'cls_alcohols' }, 'name')).toBe('Alcohols');
    expect(selectionWordsOf(scene, { kind: 'edge', id: 'e1' }, 'name')).toBe('Alcohols to Aldehydes');
  });
  it('the corner label of the map (8.3b, B2.2): the name, or "A → B" for an arrow, in both editions', () => {
    expect(selectionWordsOf(scene, { kind: 'node', id: 'cls_alcohols' }, 'corner')).toBe('Alcohols');
    expect(selectionWordsOf(scene, { kind: 'edge', id: 'e1' }, 'corner')).toBe('Alcohols → Aldehydes');
    expect(selectionWordsOf(scene, { kind: 'node', id: 'cls_gone' }, 'corner')).toBeUndefined();
  });
  it('a selection that is not drawn has no words', () => {
    expect(selectionWordsOf(scene, { kind: 'node', id: 'cls_gone' }, 'name')).toBeUndefined();
    expect(selectionWordsOf(null, { kind: 'node', id: 'cls_alcohols' }, 'full')).toBeUndefined();
  });
});
