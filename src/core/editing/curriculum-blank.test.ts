/**
 * The first drafts of the curriculum and presentation records (step 6.6c): no content default (every required choice is ABSENT until
 * chosen), and the optional `seed` of `OpenTarget` lays fields over a blank draft (never the ID, the kind or the provenance).
 */
import { describe, expect, it } from 'vitest';
import { blankDraft } from './blank';
import { openSession } from './session';
import { demoState } from '@/test-support/app-boot-kit';

const ctx = { now: () => '2026-10-21T00:00:00.000Z', newId: (prefix: string) => `${prefix}_new` } as never;

describe('blankDraft curriculum records', () => {
  it('a topic has an empty name and no aliases; the kind of topic and the order are absent', () => {
    const draft = blankDraft('topic', ctx);
    expect(draft).toMatchObject({ kind: 'topic', name: '', aliases: [], tags: [], citations: [], review: { lifecycle: 'draft', status: 'unreviewed', reasons: [] } });
    for (const field of ['topicKind', 'order', 'parentId']) expect(draft).not.toHaveProperty(field);
    expect(String(draft?.id)).toMatch(/^top/);
  });
  it('a topic mapping has only the shared fields: topic, target and role are absent', () => {
    const draft = blankDraft('topic_mapping', ctx);
    expect(draft).toMatchObject({ kind: 'topic_mapping', tags: [], citations: [] });
    for (const field of ['topicId', 'target', 'role']) expect(draft).not.toHaveProperty(field);
    expect(String(draft?.id)).toMatch(/^tmp/);
  });
  it('an exam relevance has no versions (all versions); target, exam and scope are absent', () => {
    const draft = blankDraft('exam_relevance', ctx);
    expect(draft).toMatchObject({ kind: 'exam_relevance', examVersionIds: [], tags: [], citations: [] });
    for (const field of ['target', 'examId', 'scope', 'importance']) expect(draft).not.toHaveProperty(field);
    expect(String(draft?.id)).toMatch(/^erl/);
  });
  it('a map family has provenance only; target, order, cell, group and tone are absent', () => {
    const draft = blankDraft('navigator_anchor', ctx);
    expect(draft).toMatchObject({ kind: 'navigator_anchor', provenance: { origin: 'user' } });
    for (const field of ['target', 'order', 'cell', 'group', 'tone', 'tags', 'review']) expect(draft).not.toHaveProperty(field);
    expect(String(draft?.id)).toMatch(/^anc/);
  });
});

describe('the seed of a new record', () => {
  const state = demoState();
  const open = (seed: Record<string, unknown>) => {
    const opened = openSession(ctx, state, 0, { kind: 'topic_mapping', blank: true, seed });
    if (!opened.ok) throw new Error('not opened');
    return opened.session.draft as Record<string, unknown>;
  };
  it('lays its fields over the blank draft', () => {
    expect(open({ target: { kind: 'reaction', id: 'rxn_x' } })).toMatchObject({ kind: 'topic_mapping', target: { kind: 'reaction', id: 'rxn_x' }, tags: [] });
  });
  it('never replaces the ID, the kind or the provenance', () => {
    const draft = open({ id: 'tmp_other', kind: 'topic', provenance: { origin: 'seed' }, role: 'core' });
    expect(draft).toMatchObject({ id: 'tmp_new', kind: 'topic_mapping', provenance: { origin: 'user' }, role: 'core' });
  });
});
