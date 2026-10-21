/** The first draft of a new SOURCE (step 6.6a, decision C2): every required field has its empty value; the kind of source is absent until chosen. */
import { describe, expect, it } from 'vitest';
import { blankDraft } from './blank';

const ctx = { now: () => '2026-10-21T00:00:00.000Z', newId: (prefix: string) => `${prefix}_new` } as never;

describe('blankDraft reference', () => {
  it('has a title (empty), no authors, the shared fields, and NO refKind', () => {
    const draft = blankDraft('reference', ctx);
    expect(draft).toMatchObject({ kind: 'reference', title: '', authors: [], tags: [], citations: [], review: { lifecycle: 'draft', status: 'unreviewed', reasons: [] } });
    expect(draft).not.toHaveProperty('refKind');
    expect(String(draft?.id)).toMatch(/^ref/);
  });
});
