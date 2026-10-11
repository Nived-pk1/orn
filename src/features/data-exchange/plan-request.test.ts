import { describe, expect, it } from 'vitest';
import { blockedPlan, conflictingPlan, legacyPlan, plan } from '@/test-support/data-exchange-kit';
import { blockedReason, conflictCounts, requestOf, totalsOf } from './plan-request';

describe('requestOf: every change is the FULL request', () => {
  it('a plan with no change describes itself', () => {
    expect(requestOf(conflictingPlan())).toEqual({
      mode: 'merge',
      resolutions: [
        { id: 'spc_1', resolution: 'identical_skip' },
        { id: 'spc_2', resolution: 'keep_current' },
        { id: 'spc_3', resolution: 'keep_current' },
      ],
      excluded: [],
    });
  });

  it('one choice changes one record and keeps the rest', () => {
    const request = requestOf(conflictingPlan(), { type: 'resolve', id: 'spc_2', resolution: 'replace' });
    expect(request.resolutions).toEqual([
      { id: 'spc_1', resolution: 'identical_skip' },
      { id: 'spc_2', resolution: 'replace' },
      { id: 'spc_3', resolution: 'keep_current' },
    ]);
  });

  it('a bulk choice changes the records that differ and leaves the identical one skipped', () => {
    const request = requestOf(conflictingPlan(), { type: 'resolve_all', resolution: 'import_as_copy' });
    expect(request.resolutions).toEqual([
      { id: 'spc_1', resolution: 'identical_skip' },
      { id: 'spc_2', resolution: 'import_as_copy' },
      { id: 'spc_3', resolution: 'import_as_copy' },
    ]);
  });

  it('excluding a conflicting record drops its resolution (a record is never both)', () => {
    const request = requestOf(conflictingPlan(), { type: 'exclude', ref: { kind: 'species', id: 'spc_2' } as never });
    expect(request.excluded).toEqual([{ kind: 'species', id: 'spc_2' }]);
    expect(request.resolutions?.map((r) => r.id)).toEqual(['spc_1', 'spc_3']);
  });

  it('replace_all has no resolutions; switching to merge starts from the defaults', () => {
    expect(requestOf(conflictingPlan(), { type: 'mode', mode: 'replace_all' })).toEqual({ mode: 'replace_all', excluded: [] });
    const fromReplace = requestOf(plan({ mode: 'replace_all' }), { type: 'mode', mode: 'merge' });
    expect(fromReplace).toEqual({ mode: 'merge', resolutions: [], excluded: [] });
  });

  it('including again removes the exclusion', () => {
    const excluded = plan({ excluded: [{ kind: 'reaction', id: 'rxn_1' } as never] });
    expect(requestOf(excluded).excluded).toEqual([{ kind: 'reaction', id: 'rxn_1' }]);
    expect(requestOf(excluded, { type: 'include', ref: { kind: 'reaction', id: 'rxn_1' } as never }).excluded).toEqual([]);
  });

  it('decisions are carried along (legacy only) with the changed one', () => {
    expect(requestOf(legacyPlan()).decisions).toEqual([{ id: 'hub:cls_a', chosen: 'class' }]);
    expect(requestOf(legacyPlan(), { type: 'decide', id: 'hub:cls_a', chosen: 'species' }).decisions).toEqual([{ id: 'hub:cls_a', chosen: 'species' }]);
    expect(requestOf(plan()).decisions).toBeUndefined();
  });
});

describe('totals in words', () => {
  it('counts what is written, skipped and left out', () => {
    expect(totalsOf(plan())).toEqual({ incoming: 5, excluded: 0, skipped: 0, written: 5 });
    // 3 in both: the identical one and a "keep mine" are skipped; the one replaced is written
    const p = requestOf(conflictingPlan(), { type: 'resolve', id: 'spc_2', resolution: 'replace' });
    expect(p.resolutions?.find((r) => r.id === 'spc_2')?.resolution).toBe('replace');
    expect(totalsOf(conflictingPlan())).toEqual({ incoming: 3, excluded: 0, skipped: 3, written: 0 });
    expect(conflictCounts(conflictingPlan())).toEqual({ identical: 1, differing: 2 });
  });

  it('replace_all skips nothing; an excluded record is not written', () => {
    expect(totalsOf(plan({ mode: 'replace_all', excluded: [{ kind: 'reaction', id: 'rxn_1' } as never] }))).toEqual({ incoming: 5, excluded: 1, skipped: 0, written: 4 });
  });

  it('a blocked plan says why in the words of its blockers', () => {
    expect(blockedReason(plan())).toBeUndefined();
    expect(blockedReason(blockedPlan())).toBe('1 errors must be fixed or those records left out');
  });
});
