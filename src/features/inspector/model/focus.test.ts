import { describe, expect, it } from 'vitest';
import { createDerivedIndexes } from '@/app/services/derived-indexes';
import { createCanonicalStore } from '@/core/commands';
import { demoState } from '@/test-support/app-boot-kit';
import { focusOfSelection } from './focus';
import { placeOf } from './places';
import { createFamilyStore, createSelectionStore } from '@/ui/state';

const store = createCanonicalStore({ initial: demoState(), revision: 0, validateInitial: false });
const indexes = createDerivedIndexes({ store, clock: { nowMs: () => 0 } }).current();
const state = store.getState();

describe('what a click focuses', () => {
  it('a node is its record; a virtual node (Unclassified) focuses nothing', () => {
    expect(focusOfSelection({ kind: 'node', id: 'cls_alcohols' }, () => undefined, state, indexes)?.ref).toEqual({ kind: 'class', id: 'cls_alcohols' });
    expect(focusOfSelection({ kind: 'node', id: 'virtual:unclassified' }, () => undefined, state, indexes)).toBeUndefined();
  });

  it('an arrow that is not drawn focuses nothing', () => {
    expect(focusOfSelection({ kind: 'edge', id: 'e1' }, () => undefined, state, indexes)).toBeUndefined();
  });

  it('an arrow of several reactions focuses its source family and says so', () => {
    const focus = focusOfSelection({ kind: 'edge', id: 'e1' }, () => ({ from: 'cls_alcohols', to: 'cls_aldehydes' }), state, indexes);
    expect(focus?.ref).toEqual({ kind: 'class', id: 'cls_alcohols' });
    expect(focus?.note).toMatch(/carries 3 reactions, so it is not one record/);
  });
});

describe('the places of a record', () => {
  const stores = { selection: createSelectionStore(), family: createFamilyStore() };
  it('a family on the map can be shown and opened; a record of another kind has no place, in words', () => {
    const family = placeOf({ kind: 'class', id: 'cls_alcohols' }, 'Alcohols', indexes, stores, true);
    expect(family.actions.map((a) => a.label)).toEqual(['Show on map', 'Open family']);
    family.actions[1]?.run();
    expect(stores.family.getState().open).toBe('cls_alcohols');
    expect(placeOf({ kind: 'concept', id: 'cpt_x' } as never, 'X', indexes, stores, true).line).toBe('X has no place in this view.');
    expect(placeOf({ kind: 'class', id: 'cls_alcohols' }, 'Alcohols', indexes, stores, false).line).toBe('Alcohols has no place in this view.');
  });
});
