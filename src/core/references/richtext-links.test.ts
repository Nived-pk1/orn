/** `rewriteRecordRichTextLinks` (step 3.7, Phase 3 note 2): registry-driven, pure, links outside the map untouched. */
import { describe, expect, it } from 'vitest';
import { RECORD_KINDS, RICH_TEXT_PATHS, type AnyRecord } from '../schema';
import { loadFixtureState } from '../../test-support/state-fixture';
import { rewriteRecordRichTextLinks } from './richtext-links';

const state = loadFixtureState('maximal-valid');
interface Notes {
  notes?: string;
  outcomes: { note?: string; products: { note?: string }[] }[];
  participants: { note?: string }[];
}
const reaction = Object.values(state.records.reaction)[0] as AnyRecord & Notes;
const firstOutcome = (r: Notes): { note?: string; products: { note?: string }[] } => r.outcomes[0] ?? { products: [] };

const withLinks = (): AnyRecord => {
  const copy = structuredClone(reaction) as typeof reaction;
  copy.notes = 'Compare [[rxn_old-one]] and [[cpt_untouched]].';
  const outcome = firstOutcome(copy);
  outcome.note = 'Same as [[rxn_old-one|the parent]].';
  const product = outcome.products[0];
  if (product !== undefined) product.note = 'via [[spc_old-two]]';
  if (copy.participants[0] !== undefined) copy.participants[0].note = 'plain text, no link';
  return copy;
};

const idMap = new Map([
  ['rxn_old-one', 'rxn_new-one'],
  ['spc_old-two', 'spc_new-two'],
]);

describe('rewriteRecordRichTextLinks', () => {
  it('rewrites links in every rich-text field the registry lists (top level, nested arrays), leaves other links alone, and counts them', () => {
    const input = withLinks();
    const before = structuredClone(input);
    const { record, rewritten } = rewriteRecordRichTextLinks(input, idMap);
    const out = record as typeof reaction;
    const product = firstOutcome(out).products[0];
    expect(out.notes).toBe('Compare [[rxn_new-one]] and [[cpt_untouched]].');
    expect(firstOutcome(out).note).toBe('Same as [[rxn_new-one|the parent]].');
    if (product !== undefined) expect(product.note).toBe('via [[spc_new-two]]');
    expect(rewritten).toBe(product === undefined ? 2 : 3);
    expect(input).toEqual(before); // pure: the input is not mutated
  });

  it('a record with no affected link, or an empty map, is returned as the very same object with a zero count', () => {
    const input = withLinks();
    expect(rewriteRecordRichTextLinks(input, new Map([['rxn_absent', 'rxn_other']]))).toEqual({ record: input, rewritten: 0 });
    expect(rewriteRecordRichTextLinks(input, new Map()).record).toBe(input);
  });

  it('every record kind has a registry entry, and the maximal fixture round-trips unchanged through a map that matches nothing', () => {
    for (const kind of RECORD_KINDS) expect(RICH_TEXT_PATHS[kind]).toBeDefined();
    for (const kind of RECORD_KINDS) {
      for (const record of Object.values(state.records[kind]) as AnyRecord[]) {
        expect(rewriteRecordRichTextLinks(record, new Map([['zzz_nothing', 'zzz_else']]))).toEqual({ record, rewritten: 0 });
      }
    }
  });
});
