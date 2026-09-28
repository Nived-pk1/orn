/**
 * L3 rules for curriculum (CUR-), presentation (PRS-), assets (AST-) and review state (RVW-).
 * Rules about duplicates keep the lowest ID as the record that "wins" and flag the others, so a set
 * of duplicates always leaves one clean record. Duplicates find each other through the reverse index of
 * their shared target and declare each other as peers.
 */
import { referenceEngine } from '../../references';
import { LAYER_OF_KIND, RECORD_KINDS, type AnyRecord, type RecordKind, type RecordRef } from '../../schema';
import type { RuleContext, ValidationRule } from '../contracts';
import { MAX_RELATED, NO_REFERENCED_READS, asRef, asRefs, at, existing, rule } from './helpers';
import { variantsOverlap } from './reaction-utils';

/** Records of `kind` whose `target` field points at `id`, other than `self`. */
function sharingTarget(kind: RecordKind, id: string, self: string, ctx: RuleContext): AnyRecord[] {
  const owners = ctx.indexes
    .referrersOf(id)
    .filter((r) => r.owner.kind === kind && r.path === 'target' && r.owner.id !== self)
    .map((r) => r.owner);
  return existing(ctx, owners);
}

const peersSharingTarget =
  (kind: RecordKind) =>
  (record: AnyRecord, ctx: RuleContext): RecordRef[] =>
    record.kind === kind && 'target' in record && record.target !== undefined
      ? sharingTarget(kind, record.target.id, record.id, ctx).map(asRef)
      : [];

const reviewOf = (record: AnyRecord): { readonly lifecycle: string; readonly status: string; readonly reasons: readonly string[] } | undefined =>
  'review' in record ? record.review : undefined;

const REVIEWED: readonly RecordKind[] = RECORD_KINDS.filter((kind) => LAYER_OF_KIND[kind] <= 4);

export const CURRICULUM_RULES: readonly ValidationRule[] = [
  rule({
    id: 'CUR-001',
    level: 3,
    kinds: ['exam_version'],
    defaultSeverity: 'error',
    scope: 'record',
    referencedReads: NO_REFERENCED_READS,
    description: 'Exam version effectiveFrom after effectiveTo',
    *check(version) {
      if (version.effectiveFrom === undefined || version.effectiveTo === undefined || version.effectiveFrom <= version.effectiveTo) return;
      yield { path: 'effectiveTo', message: `"${version.label}" ends (${version.effectiveTo}) before it starts (${version.effectiveFrom}).` };
    },
  }),

  rule({
    id: 'CUR-002',
    level: 3,
    kinds: ['exam_version'],
    defaultSeverity: 'warning',
    scope: 'record',
    referencedReads: NO_REFERENCED_READS,
    description: "A topic appears twice in one exam version's coverage",
    *check(version) {
      const first = new Map<string, string>();
      for (const [i, unit] of version.units.entries()) {
        for (const [j, coverage] of unit.topicCoverage.entries()) {
          const where = `unit ${i + 1}, entry ${j + 1}`;
          const earlier = first.get(coverage.topicId);
          if (earlier === undefined) {
            first.set(coverage.topicId, where);
            continue;
          }
          yield {
            path: at('units', i, 'topicCoverage', j, 'topicId'),
            message: `This topic is already covered at ${earlier}.`,
            related: [{ kind: 'topic', id: coverage.topicId }],
          };
        }
      }
    },
  }),

  rule({
    id: 'CUR-003',
    level: 3,
    kinds: ['exam_relevance'],
    defaultSeverity: 'error',
    scope: 'neighbourhood',
    // reads which exam a version belongs to (and its label, for the message)
    referencedReads: { exam_version: ['examId', 'label'] },
    description: 'exam_relevance.examVersionIds not belonging to examId',
    *check(relevance, ctx) {
      for (const [i, id] of relevance.examVersionIds.entries()) {
        const version = ctx.indexes.get(id);
        if (version?.kind !== 'exam_version' || version.examId === relevance.examId) continue;
        yield {
          path: at('examVersionIds', i),
          message: `Version "${version.label}" belongs to a different exam than this relevance record.`,
          related: [asRef(version)],
        };
      }
    },
  }),

  rule({
    id: 'CUR-004',
    level: 3,
    kinds: ['exam_relevance'],
    defaultSeverity: 'warning',
    scope: 'global',
    // compares with other records sharing the target: `peers`
    referencedReads: NO_REFERENCED_READS,
    description: 'Conflicting exam relevance for the same target, exam and overlapping versions',
    peers: peersSharingTarget('exam_relevance'),
    *check(relevance, ctx) {
      const clashing = sharingTarget('exam_relevance', relevance.target.id, relevance.id, ctx).filter(
        (other) =>
          other.kind === 'exam_relevance' &&
          other.examId === relevance.examId &&
          other.scope !== relevance.scope &&
          variantsOverlap(other.examVersionIds, relevance.examVersionIds),
      );
      if (clashing.length === 0) return;
      yield {
        path: 'scope',
        message: `${clashing.length} other relevance record${clashing.length === 1 ? '' : 's'} give this record a different scope for the same exam and versions.`,
        related: asRefs(clashing),
      };
    },
  }),

  rule({
    id: 'CUR-005',
    level: 3,
    kinds: ['exam_version'],
    defaultSeverity: 'review_required',
    scope: 'neighbourhood',
    // reads what kind of reference each citation names
    referencedReads: { reference: ['refKind'] },
    description: 'Exam version official without a citation to a syllabus document',
    *check(version, ctx) {
      if (version.status !== 'official') return;
      const cited = version.citations.some((c) => {
        const reference = ctx.indexes.get(c.referenceId);
        return reference?.kind === 'reference' && reference.refKind === 'syllabus_document';
      });
      if (cited) return;
      yield { path: 'status', message: `"${version.label}" is marked official but cites no syllabus document. Check it against the published syllabus and cite it.` };
    },
  }),

  rule({
    id: 'CUR-006',
    level: 3,
    kinds: ['topic_mapping'],
    defaultSeverity: 'warning',
    scope: 'global',
    // compares with other mappings sharing the target: `peers`
    referencedReads: NO_REFERENCED_READS,
    description: 'Duplicate topic mapping (same topic, same target)',
    peers: peersSharingTarget('topic_mapping'),
    *check(mapping, ctx) {
      const twins = sharingTarget('topic_mapping', mapping.target.id, mapping.id, ctx).filter(
        (other) => other.kind === 'topic_mapping' && other.topicId === mapping.topicId && other.id < mapping.id,
      );
      if (twins.length === 0) return;
      yield { path: 'topicId', message: 'This record is already placed in this topic by another mapping.', related: asRefs(twins) };
    },
  }),

  rule({
    id: 'PRS-001',
    level: 3,
    kinds: ['entity_display'],
    defaultSeverity: 'warning',
    scope: 'global',
    // compares with other displays sharing the target: `peers`
    referencedReads: NO_REFERENCED_READS,
    description: 'More than one entity_display for a target (lowest ID wins)',
    peers: peersSharingTarget('entity_display'),
    *check(display, ctx) {
      const winners = sharingTarget('entity_display', display.target.id, display.id, ctx).filter((o) => o.id < display.id);
      if (winners.length === 0) return;
      yield { path: 'target', message: 'Another display record for the same target takes precedence over this one.', related: asRefs(winners) };
    },
  }),

  rule({
    id: 'PRS-002',
    level: 3,
    kinds: ['navigator_anchor'],
    defaultSeverity: 'warning',
    scope: 'global',
    // compares with other anchors sharing the target: `peers`
    referencedReads: NO_REFERENCED_READS,
    description: 'Duplicate navigator anchors for a target (lowest ID wins)',
    peers: peersSharingTarget('navigator_anchor'),
    *check(anchor, ctx) {
      const winners = sharingTarget('navigator_anchor', anchor.target.id, anchor.id, ctx).filter((o) => o.id < anchor.id);
      if (winners.length === 0) return;
      yield { path: 'target', message: 'Another anchor for the same target takes precedence over this one.', related: asRefs(winners) };
    },
  }),

  rule({
    id: 'PRS-003',
    level: 3,
    kinds: ['reaction_scheme'],
    defaultSeverity: 'warning',
    scope: 'record',
    referencedReads: NO_REFERENCED_READS,
    description: 'Duplicate participant placements in one reaction scheme',
    *check(scheme) {
      const seen = new Set<string>();
      for (const [i, placement] of scheme.placements.entries()) {
        if (seen.has(placement.participantId)) {
          yield { path: at('placements', i, 'participantId'), message: `Placement ${i + 1} repeats a participant that is already placed.` };
        }
        seen.add(placement.participantId);
      }
      const products = new Set<string>();
      for (const [i, placement] of scheme.productPlacements.entries()) {
        if (products.has(placement.productId)) {
          yield { path: at('productPlacements', i, 'productId'), message: `Product placement ${i + 1} repeats a product that is already placed.` };
        }
        products.add(placement.productId);
      }
    },
  }),

  rule({
    id: 'AST-001',
    level: 3,
    kinds: ['asset'],
    defaultSeverity: 'info',
    scope: 'neighbourhood',
    // reads what refers to this asset (its referrers): reached by the referent expansion
    referencedReads: NO_REFERENCED_READS,
    description: 'Asset attached to nothing',
    *check(asset, ctx) {
      if (asset.attachedTo.length > 0 || ctx.indexes.referrersOf(asset.id).length > 0) return;
      yield { path: 'attachedTo', message: 'This asset is not attached to anything and no scheme uses it.' };
    },
  }),

  rule({
    id: 'RVW-001',
    level: 3,
    kinds: REVIEWED,
    defaultSeverity: 'review_required',
    scope: 'record',
    referencedReads: NO_REFERENCED_READS,
    description: 'Record needs review',
    *check(record) {
      const review = reviewOf(record);
      if (review?.status !== 'review_required') return;
      const why = review.reasons.length > 0 ? ` Reasons: ${review.reasons.join('; ')}.` : '';
      yield { path: 'review.status', message: `A person needs to check this record.${why}`, data: { reasons: [...review.reasons] } };
    },
  }),

  rule({
    id: 'RVW-002',
    level: 3,
    kinds: REVIEWED,
    defaultSeverity: 'info',
    scope: 'neighbourhood',
    // reads the lifecycle of every record this one refers to
    referencedReads: { '*': ['review'] },
    description: 'Published record references a draft record',
    *check(record, ctx) {
      if (reviewOf(record)?.lifecycle !== 'published') return;
      const drafts = new Map<string, AnyRecord>();
      for (const ref of referenceEngine.extract(record)) {
        if (ref.spec.target.type !== 'id' && ref.spec.target.type !== 'ref') continue;
        const target = ctx.indexes.get(ref.targetId);
        if (target !== undefined && target.id !== record.id && reviewOf(target)?.lifecycle === 'draft') drafts.set(target.id, target);
      }
      if (drafts.size === 0) return;
      const list = [...drafts.values()];
      yield {
        path: 'review.lifecycle',
        message: `This published record refers to ${list.length} draft record${list.length === 1 ? '' : 's'}.`,
        related: list.slice(0, MAX_RELATED).map(asRef),
        data: { count: list.length },
      };
    },
  }),
];
