/**
 * Export scopes (docs/PERSISTENCE.md §8): which records a scope selects, and the reference closure that
 * keeps a file self-contained. Driven entirely by REFERENCE_SPECS (src/core/schema/references.ts) through
 * the generic reference engine — never a per-kind or per-field special case (CLAUDE.md non-negotiable 7).
 *
 * References only ever point at the same or a lower layer (INV-05), so a forward closure over a finite
 * dataset always terminates within the size of the dataset: no separate traversal bound is needed here
 * (unlike the graph projections, which bound a potentially-cyclic navigation, not a one-off export pass).
 */
import { referenceEngine } from '@/core/references';
import { LAYER_OF_KIND, RECORD_KINDS, type AnyRecord, type CanonicalState, type Layer, type RecordKind, type RecordRef } from '@/core/schema';
import type { ExportOptions, MissingReference } from './contracts';

export interface ScopeSelection {
  readonly included: ReadonlySet<string>;
  readonly missingReferences: readonly MissingReference[];
}

interface IdEntry {
  readonly kind: RecordKind;
  readonly record: AnyRecord;
}

function buildIdIndex(state: CanonicalState): ReadonlyMap<string, IdEntry> {
  const index = new Map<string, IdEntry>();
  for (const kind of RECORD_KINDS) {
    for (const [id, record] of Object.entries(state.records[kind] as Record<string, AnyRecord>)) index.set(id, { kind, record: record as AnyRecord });
  }
  return index;
}

function seedIdsForLayers(state: CanonicalState, layers: readonly Layer[]): string[] {
  const kinds = RECORD_KINDS.filter((kind) => layers.includes(LAYER_OF_KIND[kind]));
  return kinds.flatMap((kind) => Object.keys(state.records[kind] as Record<string, unknown>));
}

interface ResolvedRef {
  readonly targetId: string;
  readonly targetKind: RecordKind;
  readonly path: string;
  readonly existsInState: boolean;
}

/**
 * Every cross-record reference `record` makes, resolved against `index`. A `'local'` target (a nested ID
 * defined inside the SAME record) is not a cross-record reference and is left out. A `'nested'` target's
 * container (found through the spec's `via` field) is the record to include, at the kind the spec names.
 */
function scanReferences(record: AnyRecord, index: ReadonlyMap<string, IdEntry>): readonly ResolvedRef[] {
  const out: ResolvedRef[] = [];
  for (const extracted of referenceEngine.extract(record)) {
    if (extracted.spec.target.type === 'local') continue;
    const targetKind = extracted.spec.target.type === 'nested' ? extracted.spec.target.kind : extracted.targetKind;
    const targetId = extracted.containerRecordId ?? extracted.targetId;
    if (targetKind === undefined) continue;
    const target = index.get(targetId);
    out.push({ targetId, targetKind, path: extracted.path, existsInState: target !== undefined && target.kind === targetKind });
  }
  return out;
}

/** Grows `seedIds` to include every record reachable by following outgoing references. */
function closureOf(index: ReadonlyMap<string, IdEntry>, seedIds: Iterable<string>): ScopeSelection {
  const included = new Set<string>(seedIds);
  const missing: MissingReference[] = [];
  const queue = [...included];
  while (queue.length > 0) {
    const id = queue.pop() as string;
    const entry = index.get(id);
    if (entry === undefined) continue;
    for (const ref of scanReferences(entry.record, index)) {
      if (!ref.existsInState) {
        missing.push({ from: { kind: entry.kind, id }, path: ref.path, targetKind: ref.targetKind, targetId: ref.targetId });
        continue;
      }
      if (!included.has(ref.targetId)) {
        included.add(ref.targetId);
        queue.push(ref.targetId);
      }
    }
  }
  return { included, missingReferences: missing };
}

/** No growth: reports every reference from a seed record that targets something outside the seed set. */
function danglingWithinSeeds(index: ReadonlyMap<string, IdEntry>, seedIds: Iterable<string>): ScopeSelection {
  const included = new Set<string>(seedIds);
  const missing: MissingReference[] = [];
  for (const id of included) {
    const entry = index.get(id);
    if (entry === undefined) continue;
    for (const ref of scanReferences(entry.record, index)) {
      if (!included.has(ref.targetId)) missing.push({ from: { kind: entry.kind, id }, path: ref.path, targetKind: ref.targetKind, targetId: ref.targetId });
    }
  }
  return { included, missingReferences: missing };
}

/**
 * Assets forward-reference what they attach to (`asset.attachedTo[].ref`, docs/DOMAIN_MODEL.md §11): a
 * chemistry record never references its own image. So "chemistry (layers 1-2 + assets they use)" needs a
 * reverse pass — an asset is pulled in when ONE of its attachments already resolves into `included` — never a
 * forward closure step (which would find nothing new: chemistry only ever references layers 1-2, already
 * whole in this scope, INV-29).
 */
function pullAttachedAssets(index: ReadonlyMap<string, IdEntry>, included: Set<string>): void {
  for (const [id, entry] of index) {
    if (entry.kind !== 'asset' || included.has(id)) continue;
    const attachedTo = (entry.record as unknown as { readonly attachedTo: readonly { readonly ref: RecordRef }[] }).attachedTo;
    if (attachedTo.some((attachment) => included.has(attachment.ref.id))) included.add(id);
  }
}

/**
 * Scope closure readings (REVIEW REQUIRED, docs/PROGRESS.md — PERSISTENCE.md §8 left these ambiguous):
 * - `chemistry`: layers 1-2 whole, plus the assets attached to any record in it (reverse pass above).
 * - `curriculum`: layers 1+3 whole, plus the forward closure of whatever they reference (chiefly the
 *   chemistry records `topic_mapping`/`exam_relevance` map — read as always included, not gated behind any
 *   option, since `ExportOptions` has no flag for it and the alternative (leaving `target` dangling) would
 *   fail "every scope's output ... has no dangling reference" (IMPLEMENTATION_PLAN.md §2 step 3.5).
 * - `presentation`: layer 5 whole (§8 does not enumerate it further), plus the forward closure of whatever
 *   it references (chemistry a hub/scheme points at, the asset a scheme prefers, the topics/exam a view
 *   preset filters by) — the same "no dangling reference" reading as curriculum.
 * - `subset`: exactly `options.subset`, plus the forward closure when `includeDependencies` (documented as-
 *   is); without it, references leaving the subset are reported in `missingReferences`, never silently kept
 *   or dropped.
 */
export function selectScope(state: CanonicalState, options: ExportOptions): ScopeSelection {
  const index = buildIdIndex(state);
  if (options.scope === 'full') return { included: new Set(index.keys()), missingReferences: [] };
  if (options.scope === 'chemistry') {
    const included = new Set(seedIdsForLayers(state, [1, 2]));
    pullAttachedAssets(index, included);
    return { included, missingReferences: [] };
  }
  if (options.scope === 'curriculum') return closureOf(index, seedIdsForLayers(state, [1, 3]));
  if (options.scope === 'presentation') return closureOf(index, seedIdsForLayers(state, [5]));
  const seedIds = (options.subset ?? []).map((ref) => ref.id);
  return options.includeDependencies ? closureOf(index, seedIds) : danglingWithinSeeds(index, seedIds);
}
