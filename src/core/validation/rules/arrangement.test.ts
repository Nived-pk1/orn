/**
 * PRS-004 and PRS-005 (schema version 2, step 5.5c): the curated arrangement of the overview. Presentation only: a WARNING at most.
 * The lowest ID stays clean and the others are flagged; a set of clashes always leaves one clean anchor.
 */
import { describe, expect, it } from 'vitest';
import type { CanonicalState, RecordKind } from '@/core/schema';
import { add, cloneAs, edit, recordOf, ruleFindings } from '@/test-support/rule-harness';
import { loadFixtureState } from '@/test-support/state-fixture';

const base = loadFixtureState('maximal-valid');
const FIRST = 'anc_max-ketones'; // cell (1, 0), group "Carbonyl compounds", green
const SECOND = 'anc_max-tertiary-alcohols'; // cell (63, 63), same group and tone

const rule = (id: string, state: CanonicalState, kind: RecordKind, recordId: string) => ruleFindings(id, state, { kind, id: recordId });

describe('baseline', () => {
  it('neither rule fires on the maximal fixture (two cells, one group, one tone)', () => {
    for (const id of [FIRST, SECOND]) {
      expect(rule('PRS-004', base, 'navigator_anchor', id)).toEqual([]);
      expect(rule('PRS-005', base, 'navigator_anchor', id)).toEqual([]);
    }
  });
});

describe('PRS-004: two anchors on one cell', () => {
  const twin = (): CanonicalState => add(base, 'navigator_anchor', cloneAs(recordOf(base, 'navigator_anchor', FIRST), 'anc_max-ketones-z'));

  it('flags the higher ID, names the lower one, and is a warning', () => {
    const state = twin();
    expect(rule('PRS-004', state, 'navigator_anchor', 'anc_max-ketones-z')).toMatchObject([{ path: 'cell', severity: 'warning', related: [{ kind: 'navigator_anchor', id: FIRST }] }]);
    expect(rule('PRS-004', state, 'navigator_anchor', FIRST)).toEqual([]);
  });

  it('a different cell, or no cell, is clean', () => {
    const moved = edit(twin(), 'navigator_anchor', 'anc_max-ketones-z', (a) => { a.cell = { column: 2, row: 0 }; });
    expect(rule('PRS-004', moved, 'navigator_anchor', 'anc_max-ketones-z')).toEqual([]);
    const none = edit(twin(), 'navigator_anchor', 'anc_max-ketones-z', (a) => { delete a.cell; });
    expect(rule('PRS-004', none, 'navigator_anchor', 'anc_max-ketones-z')).toEqual([]);
  });

  it('three on one cell leave exactly the lowest clean', () => {
    const three = add(twin(), 'navigator_anchor', cloneAs(recordOf(base, 'navigator_anchor', FIRST), 'anc_max-ketones-zz'));
    const flagged = ['anc_max-ketones-z', 'anc_max-ketones-zz', FIRST].filter((id) => rule('PRS-004', three, 'navigator_anchor', id).length > 0);
    expect(flagged).toEqual(['anc_max-ketones-z', 'anc_max-ketones-zz']);
  });
});

describe('PRS-005: one group in two tones', () => {
  it('flags the anchor whose tone differs from the lowest ID that has one', () => {
    const state = edit(base, 'navigator_anchor', SECOND, (a) => { a.tone = 'rose'; });
    expect(rule('PRS-005', state, 'navigator_anchor', SECOND)).toMatchObject([{ path: 'tone', severity: 'warning', related: [{ kind: 'navigator_anchor', id: FIRST }] }]);
    expect(rule('PRS-005', state, 'navigator_anchor', FIRST)).toEqual([]);
  });

  it('an anchor with a group but no tone, or another group, is clean', () => {
    const noTone = edit(base, 'navigator_anchor', SECOND, (a) => { delete a.tone; });
    expect(rule('PRS-005', noTone, 'navigator_anchor', SECOND)).toEqual([]);
    const other = edit(base, 'navigator_anchor', SECOND, (a) => { a.tone = 'rose'; a.group = 'Other compounds'; });
    expect(rule('PRS-005', other, 'navigator_anchor', SECOND)).toEqual([]);
  });

  it('the first anchor without a tone does not decide: the tone of the lowest ID that has one does', () => {
    const state = edit(edit(base, 'navigator_anchor', FIRST, (a) => { delete a.tone; }), 'navigator_anchor', SECOND, (a) => { a.tone = 'rose'; });
    expect(rule('PRS-005', state, 'navigator_anchor', SECOND)).toEqual([]);
  });
});
