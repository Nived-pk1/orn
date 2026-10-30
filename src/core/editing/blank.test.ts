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

describe('blankDraft knowledge records (step 6.6b)', () => {
  it('a concept has an empty name, no parents, the shared fields, and NO conceptKind', () => {
    const draft = blankDraft('concept', ctx);
    expect(draft).toMatchObject({ kind: 'concept', name: '', aliases: [], parentIds: [], tags: [], citations: [], review: { lifecycle: 'draft', status: 'unreviewed', reasons: [] } });
    expect(draft).not.toHaveProperty('conceptKind');
    expect(String(draft?.id)).toMatch(/^cpt/);
  });
  it('a named reaction has the empty lists and no difficulty', () => {
    const draft = blankDraft('named_reaction', ctx);
    expect(draft).toMatchObject({ kind: 'named_reaction', name: '', aliases: [], parentIds: [], conceptIds: [], prerequisiteConceptIds: [] });
    expect(draft).not.toHaveProperty('difficulty');
    expect(String(draft?.id)).toMatch(/^nrx/);
  });
  it('a transformation has empty class and concept lists and no chain statement', () => {
    const draft = blankDraft('transformation', ctx);
    expect(draft).toMatchObject({ kind: 'transformation', name: '', aliases: [], fromClassIds: [], toClassIds: [], conceptIds: [] });
    expect(draft).not.toHaveProperty('carbonChainChange');
    expect(String(draft?.id)).toMatch(/^trf/);
  });
});

describe('blankDraft relationship (step 6.6b part 4)', () => {
  it('has the shared fields and NO type, from, to or reverseKind: each is chosen', () => {
    const draft = blankDraft('relationship', ctx);
    expect(draft).toMatchObject({ kind: 'relationship', tags: [], citations: [], review: { lifecycle: 'draft', status: 'unreviewed', reasons: [] } });
    for (const field of ['type', 'from', 'to', 'reverseKind']) expect(draft).not.toHaveProperty(field);
    expect(String(draft?.id)).toMatch(/^rel/);
  });
});

describe('blankDraft caveat (step 6.6b part 5)', () => {
  it('has an empty title and statement, no targets, and NO caveatKind and NO importance', () => {
    const draft = blankDraft('caveat', ctx);
    expect(draft).toMatchObject({ kind: 'caveat', title: '', statement: '', targets: [], conceptIds: [], tags: [], citations: [] });
    for (const field of ['caveatKind', 'importance', 'triggerConditions']) expect(draft).not.toHaveProperty(field);
    expect(String(draft?.id)).toMatch(/^cav/);
  });
});

describe('blankDraft route (7.2b C1)', () => {
  it('has an empty name, NO purpose chosen (7.3a A1), no steps, no target and no concepts', () => {
    const draft = blankDraft('route', ctx);
    expect(draft).toMatchObject({ kind: 'route', name: '', purpose: '', steps: [], conceptIds: [], tags: [], citations: [] });
    expect(draft).not.toHaveProperty('target');
    expect(String(draft?.id)).toMatch(/^rte/);
  });
});
