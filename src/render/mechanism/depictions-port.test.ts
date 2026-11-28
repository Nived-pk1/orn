/**
 * Step 8.5 (size cut): the step drawing's port is made in the lazy chunks that use it, from the depictions port the navigator already gives
 * them: drawings at the fixed bond length, with atom positions when asked, the service's refusals as the words the drawing understands.
 */
import { describe, expect, it, vi } from 'vitest';
import type { StructureRep } from '@/core/schema';
import { stepDrawingFrom, type DepictionsLike } from './depictions-port';

const smiles: StructureRep = { format: 'smiles', value: '[CH3:1]' };

function fake(answer: Awaited<ReturnType<DepictionsLike['depict']>>) {
  const asked: unknown[] = [];
  const depictions: DepictionsLike = {
    depict: async (structure, size) => {
      asked.push({ structure, size });
      return answer;
    },
    createUrl: (svg) => `blob:${svg.length}`,
    revokeUrl: vi.fn(),
  };
  return { depictions, asked };
}

describe('stepDrawingFrom', () => {
  it('asks for a fixed-scale drawing at the mechanism bond length (labels set apart from it, 8.5e), with atom positions when `positions` is true and without them when it is not', async () => {
    const { depictions, asked } = fake({ ok: true, svg: '<svg/>', width: 90, height: 60, atoms: [{ map: 1, x: 1, y: 2, rx: 3, ry: 4 }], bonds: [], glyphs: [{ x0: 0, x1: 4, y0: 1, y1: 5 }] });
    const port = stepDrawingFrom(depictions);
    expect(await port.depict(smiles, true)).toEqual({ ok: true, svg: '<svg/>', width: 90, height: 60, atoms: [{ map: 1, x: 1, y: 2, rx: 3, ry: 4 }], bonds: [], glyphs: [{ x0: 0, x1: 4, y0: 1, y1: 5 }] });
    await port.depict(smiles, false);
    expect(asked).toEqual([
      { structure: smiles, size: { width: 120, height: 80, fixedScale: true, bondPx: 44, atomPositions: true } },
      { structure: smiles, size: { width: 120, height: 80, fixedScale: true, bondPx: 44 } },
    ]);
  });

  it('a turn (step 8.5g) is passed on with the atom positions, and left out when there is none', async () => {
    const { depictions, asked } = fake({ ok: true, svg: 's', width: 1, height: 1, atoms: [] });
    const port = stepDrawingFrom(depictions);
    await port.depict(smiles, true, 14);
    await port.depict(smiles, true, 0);
    expect(asked).toEqual([
      { structure: smiles, size: { width: 120, height: 80, fixedScale: true, bondPx: 44, atomPositions: true, turn: 14 } },
      { structure: smiles, size: { width: 120, height: 80, fixedScale: true, bondPx: 44, atomPositions: true } },
    ]);
  });

  it('follows the Structures setting (8.5h B1): Skeletal asks no mode; Condensed and Full both ask Condensed (the arrows need the mapped atoms only)', async () => {
    for (const [setting, wanted] of [['skeletal', undefined], ['condensed', 'condensed'], ['full', 'condensed']] as const) {
      const modes: unknown[] = [];
      const port = stepDrawingFrom({ ...fake({ ok: true, svg: 's', width: 1, height: 1 }).depictions, depict: async (_structure, _size, mode) => (modes.push(mode), { ok: true, svg: 's', width: 1, height: 1 }), mode: () => setting });
      await port.depict(smiles, true);
      expect(modes).toEqual([wanted]);
      expect(port.mode?.()).toBe(setting);
    }
  });

  it('a drawing without a table has no atoms; a table without bonds gets an empty list', async () => {
    const plain = await stepDrawingFrom(fake({ ok: true, svg: 's', width: 1, height: 1 }).depictions).depict(smiles, false);
    expect(plain).toMatchObject({ ok: true });
    expect(plain.ok && plain.atoms).toBeUndefined();
    const table = await stepDrawingFrom(fake({ ok: true, svg: 's', width: 1, height: 1, atoms: [] }).depictions).depict(smiles, true);
    expect(table.ok && table.bonds).toEqual([]);
  });

  it('a busy or cancelled answer is "unavailable" (the engine words and Retry); every other refusal keeps its reason and message', async () => {
    for (const reason of ['queue_full', 'cancelled']) {
      expect(await stepDrawingFrom(fake({ ok: false, reason, message: 'm' }).depictions).depict(smiles, true)).toEqual({ ok: false, reason: 'unavailable', message: 'm' });
    }
    expect(await stepDrawingFrom(fake({ ok: false, reason: 'refused', message: 'no atom positions: x' }).depictions).depict(smiles, true)).toEqual({ ok: false, reason: 'refused', message: 'no atom positions: x' });
  });

  it('passes the object URLs through, offers Retry and the log only when given them', () => {
    const retry = vi.fn();
    const log = vi.fn();
    const bare = stepDrawingFrom(fake({ ok: false, reason: 'x', message: 'y' }).depictions);
    expect(bare.retry).toBeUndefined();
    expect(bare.log).toBeUndefined();
    expect(bare.createUrl('abc')).toBe('blob:3');
    const full = stepDrawingFrom(fake({ ok: false, reason: 'x', message: 'y' }).depictions, { retry, log });
    full.retry?.();
    full.log?.('a', 'b');
    expect(retry).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('a', 'b');
  });
});
