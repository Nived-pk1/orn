/**
 * CUR-, PRS-, AST- and RVW- rules. Duplicate rules keep the lowest ID clean and flag the others.
 */
import { describe, expect, it } from 'vitest';
import type { CanonicalState, RecordKind } from '@/core/schema';
import { add, cloneAs, edit, recordOf, ruleFindings } from '@/test-support/rule-harness';
import { loadFixtureState, must } from '@/test-support/state-fixture';

const base = loadFixtureState('maximal-valid');
const VERSION = 'exv_max-jee-advanced-provisional';
const EXAM = 'exm_max-jee-advanced';
const RELEVANCE = 'erl_max-grignard-advanced';
const MAPPING = 'tmp_max-grignard';
const DISPLAY = 'edp_max-diethyl-ether';
const ANCHOR = 'anc_max-ketones';
const SCHEME = 'rsc_max-grignard';
const ASSET = 'ast_max-grignard-scheme';
const RXN = 'rxn_max-grignard-propanone';

const rule = (id: string, state: CanonicalState, kind: RecordKind, recordId: string) =>
  ruleFindings(id, state, { kind, id: recordId });

describe('baseline', () => {
  it('none of CUR-001…004, CUR-006, PRS-001…003, AST-001, RVW-002 fires on the maximal fixture', () => {
    for (const id of ['CUR-001', 'CUR-002', 'CUR-003', 'CUR-004', 'CUR-006', 'PRS-001', 'PRS-002', 'PRS-003', 'AST-001', 'RVW-002']) {
      expect(ruleFindings(id, base), id).toEqual([]);
    }
  });
});

describe('exam versions', () => {
  it('CUR-001: ends before it starts (equal dates are fine)', () => {
    const bad = edit(base, 'exam_version', VERSION, (v) => { v.effectiveFrom = '2026-02-01'; v.effectiveTo = '2026-01-01'; });
    expect(rule('CUR-001', bad, 'exam_version', VERSION)).toMatchObject([{ path: 'effectiveTo', severity: 'error' }]);
    expect(rule('CUR-001', edit(bad, 'exam_version', VERSION, (v) => { v.effectiveTo = '2026-02-01'; }), 'exam_version', VERSION)).toEqual([]);
  });

  it('CUR-002: a topic covered twice, flagged at the later entry across units', () => {
    const dup = edit(base, 'exam_version', VERSION, (v) => {
      const unit = must(v.units[0]);
      unit.topicCoverage.push({ ...must(unit.topicCoverage[0]) });
    });
    expect(rule('CUR-002', dup, 'exam_version', VERSION)).toMatchObject([{ severity: 'warning', path: expect.stringMatching(/^units\[0\]\.topicCoverage\[\d+\]\.topicId$/) as string }]);
  });

  it('CUR-005: official without a syllabus citation is REVIEW_REQUIRED, and a cited syllabus document clears it', () => {
    const official = edit(base, 'exam_version', VERSION, (v) => { v.status = 'official'; });
    expect(rule('CUR-005', official, 'exam_version', VERSION)).toMatchObject([{ path: 'status', severity: 'review_required' }]);
    const cited = edit(official, 'reference', 'ref_max-ncert-chem-12-2', (r) => { r.refKind = 'syllabus_document'; });
    expect(rule('CUR-005', cited, 'exam_version', VERSION)).toEqual([]);
    expect(rule('CUR-005', base, 'exam_version', VERSION)).toEqual([]);
  });
});

describe('exam relevance', () => {
  it('CUR-003: a version of another exam', () => {
    const other = add(base, 'exam', cloneAs(recordOf(base, 'exam', EXAM), 'exm_other-exam'));
    const foreign = add(other, 'exam_version', { ...cloneAs(recordOf(base, 'exam_version', VERSION), 'exv_foreign'), examId: 'exm_other-exam' as never });
    const bad = edit(foreign, 'exam_relevance', RELEVANCE, (r) => { r.examVersionIds.push('exv_foreign' as never); });
    expect(rule('CUR-003', bad, 'exam_relevance', RELEVANCE)).toMatchObject([{ path: 'examVersionIds[1]', severity: 'error', related: [{ id: 'exv_foreign' }] }]);
  });

  it('CUR-004: different scopes for the same target, exam and overlapping versions', () => {
    const rival = { ...cloneAs(recordOf(base, 'exam_relevance', RELEVANCE), 'erl_rival'), scope: 'outside' as const };
    const both = add(base, 'exam_relevance', rival);
    expect(rule('CUR-004', both, 'exam_relevance', RELEVANCE)).toMatchObject([{ path: 'scope', related: [{ id: 'erl_rival' }] }]);
    expect(rule('CUR-004', both, 'exam_relevance', 'erl_rival')).toHaveLength(1);
    const anyVersion = edit(both, 'exam_relevance', 'erl_rival', (r) => { r.examVersionIds = []; });
    expect(rule('CUR-004', anyVersion, 'exam_relevance', RELEVANCE)).toHaveLength(1);
    const sameScope = edit(both, 'exam_relevance', 'erl_rival', (r) => { r.scope = 'official'; });
    expect(rule('CUR-004', sameScope, 'exam_relevance', RELEVANCE)).toEqual([]);
  });

  it('CUR-006: a duplicate topic mapping is flagged on the higher ID only', () => {
    const twin = add(base, 'topic_mapping', cloneAs(recordOf(base, 'topic_mapping', MAPPING), 'tmp_max-grignard-z'));
    expect(rule('CUR-006', twin, 'topic_mapping', 'tmp_max-grignard-z')).toMatchObject([{ path: 'topicId', related: [{ id: MAPPING }] }]);
    expect(rule('CUR-006', twin, 'topic_mapping', MAPPING)).toEqual([]);
    const other = edit(twin, 'topic_mapping', 'tmp_max-grignard-z', (m) => { m.topicId = 'top_max-organic' as never; });
    expect(rule('CUR-006', other, 'topic_mapping', 'tmp_max-grignard-z')).toEqual([]);
  });
});

describe('presentation', () => {
  it('PRS-001: the lowest entity_display for a target wins; the others are flagged', () => {
    const twin = add(base, 'entity_display', cloneAs(recordOf(base, 'entity_display', DISPLAY), 'edp_max-diethyl-ether-z'));
    expect(rule('PRS-001', twin, 'entity_display', 'edp_max-diethyl-ether-z')).toMatchObject([{ path: 'target', severity: 'warning' }]);
    expect(rule('PRS-001', twin, 'entity_display', DISPLAY)).toEqual([]);
  });

  it('PRS-002: duplicate navigator anchors', () => {
    const twin = add(base, 'navigator_anchor', cloneAs(recordOf(base, 'navigator_anchor', ANCHOR), 'anc_max-ketones-z'));
    expect(rule('PRS-002', twin, 'navigator_anchor', 'anc_max-ketones-z')).toHaveLength(1);
    expect(rule('PRS-002', twin, 'navigator_anchor', ANCHOR)).toEqual([]);
  });

  it('PRS-003: a participant or product placed twice in one scheme', () => {
    const dup = edit(base, 'reaction_scheme', SCHEME, (s) => {
      s.placements.push({ ...must(s.placements[0]) });
      s.productPlacements.push({ ...must(s.productPlacements[0]) });
    });
    const found = rule('PRS-003', dup, 'reaction_scheme', SCHEME);
    expect(found.map((f) => f.path)).toEqual([`placements[${recordOf(base, 'reaction_scheme', SCHEME).placements.length}].participantId`, `productPlacements[${recordOf(base, 'reaction_scheme', SCHEME).productPlacements.length}].productId`]);
  });
});

describe('assets', () => {
  it('AST-001: INFO for an asset attached to nothing that no scheme uses', () => {
    const detached = edit(base, 'asset', ASSET, (a) => { a.attachedTo = []; });
    const unused = edit(detached, 'reaction_scheme', SCHEME, (s) => { delete (s as { preferAssetId?: string }).preferAssetId; });
    expect(rule('AST-001', unused, 'asset', ASSET)).toMatchObject([{ path: 'attachedTo', severity: 'info' }]);
    expect(rule('AST-001', detached, 'asset', ASSET)).toEqual([]);
  });
});

describe('review state', () => {
  it('RVW-001: REVIEW_REQUIRED with the recorded reasons, for every reviewable kind', () => {
    const flagged = edit(base, 'species', 'spc_max-water', (s) => { s.review.status = 'review_required'; s.review.reasons = ['Check the SMILES', 'Imported']; });
    expect(rule('RVW-001', flagged, 'species', 'spc_max-water')).toMatchObject([{ path: 'review.status', severity: 'review_required', data: { reasons: ['Check the SMILES', 'Imported'] } }]);
    expect(rule('RVW-001', flagged, 'species', 'spc_max-water')[0]?.message).toContain('Check the SMILES; Imported');
    const verified = edit(flagged, 'species', 'spc_max-water', (s) => { s.review.status = 'verified'; });
    expect(rule('RVW-001', verified, 'species', 'spc_max-water')).toEqual([]);
    const kinds = new Set(ruleFindings('RVW-001', base).map((f) => f.subject.kind));
    expect(kinds.has('navigator_anchor')).toBe(false);
  });

  it('RVW-002: a published record referring to drafts lists them once, as INFO', () => {
    const published = edit(base, 'reaction', RXN, (r) => { r.review.lifecycle = 'published'; });
    const drafts = ['spc_max-propanone', 'spc_max-diethyl-ether'].reduce((state, id) => edit(state, 'species', id, (s) => { s.review.lifecycle = 'draft'; }), published);
    const found = rule('RVW-002', drafts, 'reaction', RXN);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'info', path: 'review.lifecycle', data: { count: 2 } });
    expect(found[0]?.related.map((r) => r.id).sort()).toEqual(['spc_max-diethyl-ether', 'spc_max-propanone']);
    expect(rule('RVW-002', edit(drafts, 'reaction', RXN, (r) => { r.review.lifecycle = 'draft'; }), 'reaction', RXN)).toEqual([]);
  });
});
