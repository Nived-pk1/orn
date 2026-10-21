/** The duplicate check of a SOURCE (step 6.6a, decision C2): the same title (folded) and year, or the same identifier. No chemistry, no worker. */
import { describe, expect, it } from 'vitest';
import type { CanonicalState, Reference } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { MAX_SOURCE_MATCHES, sourceDuplicates } from './source-duplicates';

const ref = (id: string, over: Partial<Reference> = {}): Reference =>
  ({ id, kind: 'reference', refKind: 'textbook', title: 'Organic Chemistry', authors: [], tags: [], citations: [], provenance: { origin: 'user', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }, review: { lifecycle: 'draft', status: 'unreviewed', reasons: [] }, ...over }) as Reference;
const stateWith = (...refs: Reference[]): CanonicalState => {
  const base = demoState();
  return { ...base, records: { ...base.records, reference: Object.fromEntries(refs.map((r) => [r.id, r])) } } as CanonicalState;
};

describe('sourceDuplicates', () => {
  it('matches by the same title (case and spacing folded) AND year', () => {
    const state = stateWith(ref('ref_a', { title: 'Organic  Chemistry', year: 2010 }));
    const out = sourceDuplicates(state, ref('ref_new', { title: 'organic chemistry', year: 2010 }));
    expect(out.matches).toMatchObject([{ ref: { kind: 'reference', id: 'ref_a' }, name: 'Organic  Chemistry', qualifier: '2010', reasons: ['title'] }]);
  });
  it('a different year, or one with no year, is not the same title and year', () => {
    const state = stateWith(ref('ref_a', { year: 2010 }), ref('ref_b'));
    expect(sourceDuplicates(state, ref('ref_new', { year: 2011 })).matches).toEqual([]);
    expect(sourceDuplicates(state, ref('ref_new', { year: 2010 })).matches.map((m) => m.ref.id)).toEqual(['ref_a']);
    expect(sourceDuplicates(state, ref('ref_new')).matches.map((m) => m.ref.id)).toEqual(['ref_b']);
  });
  it('matches by the same identifier (spacing and case folded) even when the title differs, and says both reasons when both hold', () => {
    const state = stateWith(ref('ref_a', { title: 'Other', identifier: 'ISBN 978-0', year: 1999 }));
    expect(sourceDuplicates(state, ref('ref_new', { title: 'Mine', identifier: 'isbn 978-0' })).matches).toMatchObject([{ ref: { id: 'ref_a' }, reasons: ['identifier'] }]);
    expect(sourceDuplicates(state, ref('ref_new', { title: 'other', year: 1999, identifier: 'ISBN 978-0' })).matches[0]?.reasons).toEqual(['identifier', 'title']);
  });
  it('never matches itself, and caps the list with a count of the rest', () => {
    const many = Array.from({ length: MAX_SOURCE_MATCHES + 3 }, (_, i) => ref(`ref_${String(i).padStart(2, '0')}`));
    const out = sourceDuplicates(stateWith(...many), ref('ref_new'));
    expect(out.matches).toHaveLength(MAX_SOURCE_MATCHES);
    expect(out.more).toBe(3);
    expect(sourceDuplicates(stateWith(ref('ref_a')), ref('ref_a')).matches).toEqual([]);
  });
});
