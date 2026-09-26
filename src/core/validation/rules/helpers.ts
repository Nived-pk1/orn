/**
 * Small shared pieces for the L3 rule files. Nothing here knows a specific record, name or field of a
 * reaction: rules are built from the schema's own vocabulary.
 */
import { formatPath } from '../../references';
import type { AnyRecord, RecordKind, RecordRef } from '../../schema';
import type { FindingDraft, RuleContext, Severity, ValidationRule } from '../contracts';

/**
 * Declares a rule for records of `K`. `check` sees the narrowed record type; the runner only calls it
 * for kinds listed in `kinds`, which is what makes storing it in the (wider) rule list sound.
 */
export function rule<K extends RecordKind>(spec: ValidationRule<K> & { readonly level: 3 }): ValidationRule {
  return spec as unknown as ValidationRule;
}

/** Builds a concrete path such as `outcomes[2].products[0].ref`. */
export const at = (...tokens: readonly (string | number)[]): string => formatPath(tokens);

/** Lifecycle-aware rules: WARNING while a record is a draft, ERROR once published (VALIDATION_RULES.md §1). */
export function lifecycleSeverity(record: { readonly review: { readonly lifecycle: 'draft' | 'published' } }): Severity {
  return record.review.lifecycle === 'published' ? 'error' : 'warning';
}

export const refKey = (ref: RecordRef): string => `${ref.kind}:${ref.id}`;

/** Records named by `refs` that exist in the indexes, in order, without repeats. */
export function existing(ctx: RuleContext, refs: Iterable<RecordRef>): AnyRecord[] {
  const seen = new Set<string>();
  const out: AnyRecord[] = [];
  for (const ref of refs) {
    if (seen.has(ref.id)) continue;
    seen.add(ref.id);
    const found = ctx.indexes.get(ref.id);
    if (found !== undefined) out.push(found);
  }
  return out;
}

export const MAX_RELATED = 20;
export const asRef = (record: AnyRecord): RecordRef => ({ kind: record.kind, id: record.id });
export const asRefs = (records: readonly AnyRecord[]): RecordRef[] => records.slice(0, MAX_RELATED).map(asRef);

/** Upper bound on records visited by a graph walk inside one rule; beyond it a rule says so. */
export const MAX_WALK_NODES = 10_000;

/** Every record of `kinds`: the safe answer when a peer computation hits its bound. */
export function allOfKinds(ctx: RuleContext, kinds: readonly RecordKind[]): RecordRef[] {
  return kinds.flatMap((kind) =>
    Object.keys(ctx.state.records[kind]).map((id): RecordRef => ({ kind, id })),
  );
}

export type Draft = FindingDraft;
