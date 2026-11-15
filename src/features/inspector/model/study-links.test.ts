/** The "Links" of a family in the panel (step 8.4m, M3): only a family on the map has them; the rows carry names. */
import { describe, expect, it } from 'vitest';
import { documentToState } from '@/core/dataset';
import { indexEngine } from '@/core/indexes';
import type { RecordRef } from '@/core/schema';
import { BUSY_FAMILY, fullMap } from '../../../../tests/fixtures/full-map/full-map';
import { studyInspectorModel } from './study-model';

const parsed = documentToState(fullMap().document as never);
if (!parsed.ok) throw new Error('fixture');
const snapshot = { state: parsed.state, indexes: indexEngine.build(parsed.state, 1) };
const classRef = (id: string): RecordRef => ({ kind: 'class', id }) as RecordRef;

describe('the Links of a family', () => {
  it('a family on the map: Turns into and Made from, one named row per neighbour, the bucket by its map name', () => {
    const links = studyInspectorModel(classRef(BUSY_FAMILY), snapshot, 'study')?.links;
    expect(links?.turnsInto).toHaveLength(11);
    expect(links?.madeFrom).toHaveLength(9);
    expect(links?.turnsInto.map((row) => row.name)).toEqual(expect.arrayContaining(['Family 12', 'Not in a family yet']));
    for (const row of links?.turnsInto ?? []) expect(row.reactions).toBeGreaterThan(0);
  });

  it('a class that is not a box of the map has no Links', () => {
    expect(studyInspectorModel(classRef('cls_orphan-a'), snapshot, 'study')?.links).toBeUndefined();
  });
});
