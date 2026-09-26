/**
 * L2 analysis of one record's references, driven only by the reference registry. The REF rules are thin
 * views over this single pass so that precedence between them is decided in one place:
 *   layer (REF-003) before kind (REF-002) before existence (REF-001), one diagnostic per bad reference.
 */
import { LAYER_OF_KIND, RICH_TEXT_PATHS, recordKindOfId, type AnyRecord, type RecordRef } from '../../schema';
import { formatPath, matchPath, parsePath, referenceEngine } from '../../references';
import type { ExtractedReference } from '../../references/contracts';
import { richTextLinks } from '../../text';
import type { FindingDraft, RuleContext } from '../contracts';

export type ReferenceRuleId =
  | 'REF-001'
  | 'REF-002'
  | 'REF-003'
  | 'REF-004'
  | 'REF-005'
  | 'REF-006'
  | 'REF-007'
  | 'REF-008';

export interface ReferenceIssue {
  readonly ruleId: ReferenceRuleId;
  readonly draft: FindingDraft;
}

/** Related records and listed IDs are capped; the size of the rest is kept in `data`. */
const MAX_RELATED = 20;

const label = (kind: string): string => kind.replace(/_/g, ' ');
const INDEX = /\[\d+\]/g;

/** Nested IDs of a record grouped by collection path (`outcomes[].products`). Records are immutable. */
const nestedByCollection = new WeakMap<AnyRecord, ReadonlyMap<string, ReadonlySet<string>>>();

function nestedIdsIn(record: AnyRecord, collection: string): ReadonlySet<string> {
  let groups = nestedByCollection.get(record);
  if (groups === undefined) {
    const built = new Map<string, Set<string>>();
    for (const { path, id } of referenceEngine.nestedIds(record)) {
      const key = path.replace(INDEX, '[]').replace(/\[\]\.id$/, '');
      built.set(key, (built.get(key) ?? new Set<string>()).add(id));
    }
    groups = built;
    nestedByCollection.set(record, groups);
  }
  return groups.get(collection) ?? new Set<string>();
}

function issue(
  ruleId: ReferenceRuleId,
  ref: ExtractedReference,
  message: string,
  extra: Partial<FindingDraft> = {},
): ReferenceIssue {
  return { ruleId, draft: { path: ref.path, message, data: { targetId: ref.targetId }, ...extra } };
}

/** id / ref targets: layer, allowed kind, prefix, existence, self-reference — in that order. */
function checkRecordReference(record: AnyRecord, ref: ExtractedReference, ctx: RuleContext): ReferenceIssue | undefined {
  const { target } = ref.spec;
  if (target.type !== 'id' && target.type !== 'ref') return undefined;
  const at = `${label(record.kind)} ${record.id}, ${ref.path},`;
  const declared = ref.targetKind;
  if (declared === undefined) return issue('REF-002', ref, `${at} names a kind that is not a record kind.`);
  if (LAYER_OF_KIND[declared] > LAYER_OF_KIND[record.kind]) {
    return issue(
      'REF-003',
      ref,
      `${at} points to a ${label(declared)}, which is in a higher layer than a ${label(record.kind)} may refer to.`,
    );
  }
  if (target.type === 'ref' && !target.kinds.includes(declared)) {
    return issue('REF-002', ref, `${at} may not point to a ${label(declared)}.`);
  }
  if (recordKindOfId(ref.targetId) !== declared) {
    return issue('REF-002', ref, `${at} names a ${label(declared)}, but ${ref.targetId} is not the ID of one.`);
  }
  if (ctx.indexes.get(ref.targetId) === undefined) {
    const related: RecordRef[] = [{ kind: declared, id: ref.targetId }];
    return issue('REF-001', ref, `${at} refers to ${ref.targetId}, but no such ${label(declared)} exists.`, { related });
  }
  if (ref.targetId === record.id) {
    return issue('REF-007', ref, `${at} refers to the ${label(record.kind)} itself, which is not allowed here.`);
  }
  return undefined;
}

/** local targets: the ID must be defined in this same record. */
function checkLocalReference(record: AnyRecord, ref: ExtractedReference): ReferenceIssue | undefined {
  const { target } = ref.spec;
  if (target.type !== 'local' || nestedIdsIn(record, target.collection).has(ref.targetId)) return undefined;
  return issue(
    'REF-004',
    ref,
    `${label(record.kind)} ${record.id}, ${ref.path}, refers to ${ref.targetId}, which is not in this record's ${target.collection}.`,
  );
}

/** nested targets: the ID must be defined in the record named by the sibling/root field. */
function checkNestedReference(record: AnyRecord, ref: ExtractedReference, ctx: RuleContext): ReferenceIssue | undefined {
  const { target } = ref.spec;
  if (target.type !== 'nested') return undefined;
  const at = `${label(record.kind)} ${record.id}, ${ref.path},`;
  if (ref.containerRecordId === undefined) {
    return issue(
      'REF-005',
      ref,
      `${at} refers to ${ref.targetId}, but the field naming its ${label(target.kind)} does not name one.`,
    );
  }
  // A missing or wrong-kind container is reported on the field that names it (REF-001 / REF-002).
  const container = ctx.indexes.get(ref.containerRecordId);
  if (container === undefined || container.kind !== target.kind) return undefined;
  if (nestedIdsIn(container, target.collection).has(ref.targetId)) return undefined;
  return issue(
    'REF-005',
    ref,
    `${at} refers to ${ref.targetId}, which is not in the ${target.collection} of ${label(target.kind)} ${container.id}.`,
    { related: [{ kind: target.kind, id: container.id }] },
  );
}

/** REF-006: a nested ID defined twice in this record or also by another record (INV-01). */
function checkDuplicateIds(record: AnyRecord, ctx: RuleContext): ReferenceIssue[] {
  const own = referenceEngine.nestedIds(record);
  const counts = new Map<string, number>();
  for (const { id } of own) counts.set(id, (counts.get(id) ?? 0) + 1);
  const issues: ReferenceIssue[] = [];
  for (const { path, id } of own) {
    const others = ctx.indexes.definersOf(id).filter((ref) => ref.id !== record.id);
    if ((counts.get(id) ?? 0) < 2 && others.length === 0) continue;
    const where =
      others.length > 0
        ? `also defined by ${others.length} other record${others.length === 1 ? '' : 's'}`
        : 'defined more than once in this record';
    issues.push({
      ruleId: 'REF-006',
      draft: {
        path,
        message: `${label(record.kind)} ${record.id}, ${path}: the ID ${id} is ${where}. IDs must be unique across the whole dataset.`,
        related: others.slice(0, MAX_RELATED),
        data: { id, ...(others.length > MAX_RELATED ? { omitted: others.length - MAX_RELATED } : {}) },
      },
    });
  }
  return issues;
}

/** REF-008: one finding per rich-text field, listing its links to records that do not exist. */
function checkRichTextLinks(record: AnyRecord, ctx: RuleContext): ReferenceIssue[] {
  const issues: ReferenceIssue[] = [];
  for (const spec of RICH_TEXT_PATHS[record.kind]) {
    for (const match of matchPath(record, parsePath(spec))) {
      if (typeof match.value !== 'string' || !match.value.includes('[[')) continue;
      const missing = richTextLinks(match.value).filter(
        (link) => recordKindOfId(link.id) !== link.kind || ctx.indexes.get(link.id) === undefined,
      );
      if (missing.length === 0) continue;
      const path = formatPath(match.tokens);
      const listed = missing.slice(0, MAX_RELATED);
      const more = missing.length - listed.length;
      issues.push({
        ruleId: 'REF-008',
        draft: {
          path,
          message: `${label(record.kind)} ${record.id}, ${path}, links to ${missing.length === 1 ? 'a record' : 'records'} that do not exist: ${listed.map((link) => link.id).join(', ')}${more > 0 ? ` and ${more} more` : ''}.`,
          related: listed,
          data: { missing: missing.length },
        },
      });
    }
  }
  return issues;
}

/** Cache per index handle (one revision) and record object: the eight REF rules share one pass. */
const analyses = new WeakMap<object, WeakMap<AnyRecord, readonly ReferenceIssue[]>>();

export function analyseReferences(record: AnyRecord, ctx: RuleContext): readonly ReferenceIssue[] {
  let perRecord = analyses.get(ctx.indexes);
  if (perRecord === undefined) {
    perRecord = new WeakMap();
    analyses.set(ctx.indexes, perRecord);
  }
  const cached = perRecord.get(record);
  if (cached !== undefined) return cached;
  const issues: ReferenceIssue[] = [];
  for (const ref of referenceEngine.extract(record)) {
    const found =
      checkRecordReference(record, ref, ctx) ?? checkLocalReference(record, ref) ?? checkNestedReference(record, ref, ctx);
    if (found !== undefined) issues.push(found);
  }
  issues.push(...checkDuplicateIds(record, ctx), ...checkRichTextLinks(record, ctx));
  perRecord.set(record, issues);
  return issues;
}
