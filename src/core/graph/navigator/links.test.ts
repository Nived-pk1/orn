/** A family's links (step 8.4m, M3): one row per neighbour family and direction, with its DISTINCT reactions. */
import { describe, expect, it } from 'vitest';
import { documentToState } from '../../dataset';
import { indexEngine } from '../../indexes';
import { BUSY_FAMILY, familyId, fullMap, QUIET_FAMILY } from '../../../../tests/fixtures/full-map/full-map';
import { UNCLASSIFIED_HUB_ID } from './hubs';
import { familyLinksOf } from './links';

const parsed = documentToState(fullMap().document as never);
if (!parsed.ok) throw new Error('fixture');
const rollup = indexEngine.build(parsed.state, 1).navigatorRollup();

describe('familyLinksOf', () => {
  it('lists every neighbour once per direction, the bucket included, never the family itself', () => {
    const links = familyLinksOf(rollup, BUSY_FAMILY);
    expect(links.turnsInto.map((row) => row.id).sort()).toEqual([...[1, 2, 3, 5, 6, 9, 12, 13, 14, 16].map(familyId), UNCLASSIFIED_HUB_ID].sort());
    expect(links.madeFrom.map((row) => row.id).sort()).toEqual([...[2, 4, 6, 7, 9, 10, 12, 15].map(familyId), UNCLASSIFIED_HUB_ID].sort());
    expect([...links.turnsInto, ...links.madeFrom].some((row) => row.id === BUSY_FAMILY)).toBe(false);
  });

  it('counts distinct reactions and orders by that count, then by id', () => {
    const links = familyLinksOf(rollup, BUSY_FAMILY);
    for (const row of links.turnsInto) {
      const ids = new Set(rollup.candidatesFrom(BUSY_FAMILY).filter((c) => c.toHub === row.id).map((c) => c.reactionId));
      expect(row.reactions, row.id).toBe(ids.size);
    }
    const sorted = [...links.turnsInto].sort((a, b) => b.reactions - a.reactions || (a.id < b.id ? -1 : 1));
    expect(links.turnsInto).toEqual(sorted);
  });

  it('a quiet family and an id that is no hub', () => {
    const quiet = familyLinksOf(rollup, QUIET_FAMILY);
    expect(quiet.turnsInto.map((row) => row.id)).toEqual(expect.arrayContaining([familyId(12), familyId(13)]));
    expect(quiet.madeFrom).toHaveLength(2);
    expect(familyLinksOf(rollup, 'cls_nothing')).toEqual({ turnsInto: [], madeFrom: [] });
  });
});
