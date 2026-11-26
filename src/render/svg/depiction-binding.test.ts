/**
 * Step 8.5g B: in Full mode a drawing is asked for at 1.4 times the context's bond standard (its labels are then set for that size), and
 * what the structure tool says about "all atoms" reaches the drawing's status. Other modes are asked as before.
 */
import { describe, expect, it } from 'vitest';
import type { StructureMode } from '@/chem/contracts';
import type { StructureRep } from '@/core/schema';
import { manualTimers } from '@/test-support/navigator-kit';
import { createDepictionBinding, type DepictionPort } from './depiction-binding';

const STRUCTURE: StructureRep = { format: 'smiles', value: 'CCO' };

function rig(mode: StructureMode, answer: { readonly allAtoms?: boolean } = {}) {
  const asked: (number | undefined)[] = [];
  const port: DepictionPort = {
    keyOf: (_structure, size) => (asked.push(size.bondPx), `key-${size.bondPx}`),
    depict: async () => ({ ok: true, svg: '<svg/>', width: 10, height: 10, ...answer }),
    cancel: () => undefined,
    mode: () => mode,
    createUrl: () => 'blob:x',
    revokeUrl: () => undefined,
  };
  return { asked, binding: createDepictionBinding(port, manualTimers(), { width: 120, height: 80, fixedScale: true }) };
}

describe('createDepictionBinding in Full mode', () => {
  it('asks at 1.4 times the standard; Skeletal and Condensed ask at the standard', () => {
    for (const [mode, px] of [['full', 39], ['skeletal', 28], ['condensed', 28]] as const) {
      const r = rig(mode);
      r.binding.keyOf(STRUCTURE, 28);
      expect(r.asked).toEqual([px]);
    }
  });

  it('hands on whether all atoms were drawn', async () => {
    const r = rig('full', { allAtoms: false });
    const key = r.binding.keyOf(STRUCTURE, 28);
    r.binding.manager.request(key);
    await Promise.resolve();
    await Promise.resolve();
    expect(r.binding.manager.snapshot(key)).toMatchObject({ state: 'ready', allAtoms: false });
  });
});
