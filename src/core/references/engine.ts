/**
 * Generic reference engine (contracts.ts) driven entirely by the registry. It never names a field
 * or a record kind: every behaviour comes from a ReferenceSpec / NestedIdSpec.
 */
import {
  NESTED_ID_SPECS,
  RECORD_KINDS,
  REFERENCE_SPECS,
  type AnyRecord,
  type NestedIdSpec,
  type RecordKind,
  type ReferenceSpec,
} from '../schema';
import type { ExtractedReference, ReferenceEngine } from './contracts';
import {
  applyEdits,
  fieldOf,
  formatPath,
  isObject,
  matchPath,
  parsePath,
  type Edit,
  type PathMatch,
  type PathSegment,
} from './paths';

interface CompiledReference {
  readonly spec: ReferenceSpec;
  readonly segments: readonly PathSegment[];
  /** Index into `PathMatch.ends` of the element/field removed on detach. */
  readonly removeAt: number;
}

interface CompiledNestedId {
  readonly spec: NestedIdSpec;
  readonly segments: readonly PathSegment[];
}

function isRecordKind(value: unknown): value is RecordKind {
  return typeof value === 'string' && (RECORD_KINDS as readonly string[]).includes(value);
}

/** The container of a spec must be a leading part of its path; anything else is a registry bug. */
function compileReference(spec: ReferenceSpec): CompiledReference {
  const segments = parsePath(spec.path);
  if (spec.container === undefined) return { spec, segments, removeAt: segments.length - 1 };
  const container = parsePath(spec.container);
  const isPrefix =
    container.length <= segments.length &&
    container.every((part, i) => part.key === segments[i]?.key && part.each === segments[i]?.each);
  if (!isPrefix) throw new Error(`Registry container "${spec.container}" is not a prefix of "${spec.path}"`);
  return { spec, segments, removeAt: container.length - 1 };
}

function groupByOwner<T extends { readonly owner: RecordKind }>(
  items: readonly T[],
): ReadonlyMap<RecordKind, readonly T[]> {
  const groups = new Map<RecordKind, T[]>();
  for (const item of items) groups.set(item.owner, [...(groups.get(item.owner) ?? []), item]);
  return groups;
}

interface ValueRef {
  readonly id: string;
  readonly kind?: RecordKind;
}

/** The ID (and, for `{kind,id}` values, the kind) a matched value carries; undefined if malformed. */
function readValue(spec: ReferenceSpec, value: unknown): ValueRef | undefined {
  const { target } = spec;
  if (target.type === 'ref') {
    const id = fieldOf(value, 'id');
    const kind = fieldOf(value, 'kind');
    if (typeof id !== 'string') return undefined;
    return isRecordKind(kind) ? { id, kind } : { id };
  }
  if (typeof value !== 'string') return undefined;
  return target.type === 'id' ? { id: value, kind: target.kind } : { id: value };
}

/** Record that must hold a nested target, found through the spec's `via` field. */
function containerRecordId(spec: ReferenceSpec, root: unknown, match: PathMatch): string | undefined {
  if (spec.target.type !== 'nested') return undefined;
  const { via, kind } = spec.target;
  const holder = via.scope === 'root' ? root : match.parent;
  const raw = fieldOf(holder, via.field);
  if (typeof raw === 'string') return raw;
  // A SubstanceRef-style sibling only names the container when its kind is the expected one.
  return isObject(raw) && raw['kind'] === kind && typeof raw['id'] === 'string' ? raw['id'] : undefined;
}

export function createReferenceEngine(
  specs: readonly ReferenceSpec[] = REFERENCE_SPECS,
  nestedSpecs: readonly NestedIdSpec[] = NESTED_ID_SPECS,
): ReferenceEngine {
  const references = groupByOwner(specs.map((spec) => compileReference(spec)).map((c) => ({ ...c, owner: c.spec.owner })));
  const nestedIdSpecs = groupByOwner(nestedSpecs.map((spec) => ({ spec, segments: parsePath(spec.path), owner: spec.owner })));

  const referencesOf = (record: AnyRecord): readonly CompiledReference[] => references.get(record.kind) ?? [];
  const nestedOf = (record: AnyRecord): readonly CompiledNestedId[] => nestedIdSpecs.get(record.kind) ?? [];

  /** Every well-formed reference in the record, with the compiled spec that found it. */
  const visitReferences = (
    record: AnyRecord,
    visit: (compiled: CompiledReference, match: PathMatch, value: ValueRef) => void,
  ): void => {
    for (const compiled of referencesOf(record)) {
      for (const match of matchPath(record, compiled.segments)) {
        const value = readValue(compiled.spec, match.value);
        if (value !== undefined) visit(compiled, match, value);
      }
    }
  };

  const nestedIds: ReferenceEngine['nestedIds'] = (record) =>
    nestedOf(record).flatMap(({ segments }) =>
      matchPath(record, segments).flatMap((match) =>
        typeof match.value === 'string' ? [{ path: formatPath(match.tokens), id: match.value }] : [],
      ),
    );

  return {
    extract(record) {
      const found: ExtractedReference[] = [];
      visitReferences(record, ({ spec }, match, value) => {
        const container = containerRecordId(spec, record, match);
        found.push({
          spec,
          path: formatPath(match.tokens),
          targetId: value.id,
          ...(value.kind === undefined ? {} : { targetKind: value.kind }),
          ...(container === undefined ? {} : { containerRecordId: container }),
        });
      });
      return found;
    },

    nestedIds,

    remap(record, idMap) {
      const edits: Edit[] = [];
      const mapped = (id: string): string | undefined => {
        const next = idMap.get(id);
        return next === undefined || next === id ? undefined : next;
      };
      const own = mapped(record.id);
      if (own !== undefined) edits.push({ tokens: ['id'], value: own });
      for (const { segments } of nestedOf(record)) {
        for (const match of matchPath(record, segments)) {
          const next = typeof match.value === 'string' ? mapped(match.value) : undefined;
          if (next !== undefined) edits.push({ tokens: match.tokens, value: next });
        }
      }
      visitReferences(record, ({ spec }, match, value) => {
        const next = mapped(value.id);
        if (next === undefined) return;
        edits.push({ tokens: spec.target.type === 'ref' ? [...match.tokens, 'id'] : match.tokens, value: next });
      });
      return applyEdits(record, edits);
    },

    detach(record, deletedIds) {
      const edits: Edit[] = [];
      visitReferences(record, (compiled, match, value) => {
        if (compiled.spec.onDelete !== 'detach' || !deletedIds.has(value.id)) return;
        edits.push({ tokens: match.tokens.slice(0, match.ends[compiled.removeAt]), remove: true });
      });
      return applyEdits(record, edits);
    },
  };
}
