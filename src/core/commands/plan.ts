/**
 * Turns one DomainCommand into a plan (record writes and an optional meta replacement) against the
 * current working state, or into a CommandError. Planning never mutates anything: a rejected command
 * leaves no trace, and applying a plan cannot fail. Errors are values (CLAUDE.md §6).
 *
 * Kind-agnostic: reference handling goes through the registry-driven reference engine.
 */
import {
  ANY_ID_PATTERN,
  DatasetMetaSchema,
  recordKindOfId,
  type AnyRecord,
  type CanonicalState,
  type DatasetMeta,
  type RecordRef,
} from '../schema';
import type { CoreIndexes } from '../indexes/contracts';
import { referenceEngine } from '../references';
import type { DeleteImpact } from '../references/contracts';
import { parseRecord } from '../validation/l1';
import type { CommandError, DomainCommand } from './contracts';
import { computeDeleteImpact, isEmptyImpact, removedIds } from './impact';
import { isRecordKind, jsonEqual, recordAt, refKey } from './lookup';

/** `next` undefined deletes the record. */
export interface Write {
  readonly ref: RecordRef;
  readonly next: AnyRecord | undefined;
}

export interface Plan {
  readonly writes: readonly Write[];
  readonly meta?: DatasetMeta;
}

export type PlanResult = { readonly ok: true; readonly plan: Plan } | { readonly ok: false; readonly error: CommandError };

/** The state a command sees. `indexes()` is built lazily when earlier commands of a batch changed it. */
export interface PlanView {
  readonly state: CanonicalState;
  indexes(): CoreIndexes;
}

const fail = (error: CommandError): PlanResult => ({ ok: false, error });
const done = (writes: readonly Write[], meta?: DatasetMeta): PlanResult => ({
  ok: true,
  plan: meta === undefined ? { writes } : { writes, meta },
});

const describe = (ref: RecordRef): string => `${ref.kind} ${ref.id}`;

function malformed(record: AnyRecord): PlanResult {
  const parsed = parseRecord(record.kind, record);
  return fail({
    code: 'VALIDATION_FAILED',
    message: 'The record has no valid kind and ID.',
    ...(parsed.ok ? {} : { findings: parsed.findings }),
  });
}

/** kind and ID as far as they can be trusted to index a table (no prototype keys, prefix matches kind). */
function refOf(record: AnyRecord): RecordRef | undefined {
  const { kind, id } = record as { kind: unknown; id: unknown };
  return isRecordKind(kind) && typeof id === 'string' && ANY_ID_PATTERN.test(id) ? ({ kind, id } as RecordRef) : undefined;
}

function planCreate(view: PlanView, record: AnyRecord): PlanResult {
  const ref = refOf(record);
  if (ref === undefined || recordKindOfId(ref.id) !== ref.kind) return malformed(record);
  if (recordAt(view.state, ref) !== undefined) {
    return fail({ code: 'ID_CONFLICT', message: `${describe(ref)} already exists.` });
  }
  return done([{ ref, next: record }]);
}

function planUpdate(view: PlanView, record: AnyRecord): PlanResult {
  const ref = refOf(record);
  if (ref === undefined) return malformed(record);
  if (recordKindOfId(ref.id) !== ref.kind) {
    return fail({ code: 'IMMUTABLE_FIELD', message: `The kind of ${ref.id} cannot change: the ID prefix fixes it.` });
  }
  const current = recordAt(view.state, ref);
  if (current === undefined) return fail({ code: 'NOT_FOUND', message: `${describe(ref)} does not exist.` });
  return done(jsonEqual(current, record) ? [] : [{ ref, next: record }]);
}

function refusal(impact: DeleteImpact, ref: RecordRef, why: string): PlanResult {
  return fail({ code: 'DELETE_RESTRICTED', message: `${describe(ref)} cannot be deleted: ${why}`, impact });
}

function planDelete(view: PlanView, ref: RecordRef, mode: 'restrict' | 'apply_cascade'): PlanResult {
  if (!isRecordKind(ref.kind) || recordAt(view.state, ref) === undefined) {
    return fail({ code: 'NOT_FOUND', message: `${describe(ref)} does not exist.` });
  }
  const impact = computeDeleteImpact(view.state, view.indexes(), [ref]);
  if (impact.blockedBy.length > 0) {
    return refusal(impact, ref, `${impact.blockedBy.length} restricting reference(s) still point at it.`);
  }
  if (mode === 'restrict' && !isEmptyImpact(impact)) {
    return refusal(impact, ref, 'other records depend on it; use apply_cascade to remove or detach them.');
  }
  const gone = removedIds(view.state, impact);
  const removed = [...impact.targets, ...impact.cascades];
  const removedKeys = new Set(removed.map(refKey));
  const writes: Write[] = removed.map((target) => ({ ref: target, next: undefined }));
  const survivors = new Map<string, RecordRef>();
  for (const referrer of impact.detaches) survivors.set(refKey(referrer.owner), referrer.owner);
  for (const owner of survivors.values()) {
    if (removedKeys.has(refKey(owner))) continue;
    const before = recordAt(view.state, owner);
    if (before === undefined) continue;
    const after = referenceEngine.detach(before, gone);
    if (after !== before) writes.push({ ref: owner, next: after });
  }
  return done(writes);
}

function planReplaceReferences(view: PlanView, from: RecordRef, to: RecordRef): PlanResult {
  if (from.kind !== to.kind) {
    return fail({ code: 'VALIDATION_FAILED', message: `References can only be replaced within one kind (${from.kind} → ${to.kind}).` });
  }
  if (from.id === to.id) return fail({ code: 'VALIDATION_FAILED', message: 'The source and the replacement are the same record.' });
  for (const ref of [from, to]) {
    if (!isRecordKind(ref.kind) || recordAt(view.state, ref) === undefined) {
      return fail({ code: 'NOT_FOUND', message: `${describe(ref)} does not exist.` });
    }
  }
  const idMap = new Map([[from.id, to.id]]);
  const owners = new Map<string, RecordRef>();
  for (const referrer of view.indexes().referrersOf(from.id)) {
    // References held by `from` itself go away with it (or stay, when `from` survives): never rewritten,
    // because remapping a record's own references would also rename the record.
    if (referrer.owner.id !== from.id) owners.set(refKey(referrer.owner), referrer.owner);
  }
  const writes: Write[] = [];
  for (const owner of owners.values()) {
    const before = recordAt(view.state, owner);
    if (before === undefined) continue;
    const after = referenceEngine.remap(before, idMap);
    if (after !== before) writes.push({ ref: owner, next: after });
  }
  return done(writes);
}

function planMeta(view: PlanView, meta: DatasetMeta): PlanResult {
  const parsed = DatasetMetaSchema.safeParse(meta);
  if (!parsed.success) {
    const problems = parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join('.') || 'meta'}: ${issue.message}`);
    return fail({ code: 'VALIDATION_FAILED', message: `Invalid dataset metadata: ${problems.join('; ')}` });
  }
  return jsonEqual(view.state.meta, meta) ? done([]) : done([], meta);
}

export function planCommand(view: PlanView, command: DomainCommand): PlanResult {
  switch (command.type) {
    case 'record.create':
      return planCreate(view, command.record);
    case 'record.update':
      return planUpdate(view, command.record);
    case 'record.delete':
      return planDelete(view, command.ref, command.mode);
    case 'record.replaceReferences':
      return planReplaceReferences(view, command.from, command.to);
    case 'meta.update':
      return planMeta(view, command.meta);
    default:
      return fail({ code: 'INTERNAL', message: `Unknown command type "${String((command as { type?: unknown }).type)}".` });
  }
}

type MutableTables = Record<string, Record<string, unknown>>;

/** Applies a plan inside an Immer recipe. Cannot fail: planning checked every precondition. */
export function applyPlan(draft: { meta: unknown; records: unknown }, plan: Plan): void {
  const tables = draft.records as MutableTables;
  for (const { ref, next } of plan.writes) {
    const table = tables[ref.kind] as Record<string, unknown>;
    if (next === undefined) Reflect.deleteProperty(table, ref.id);
    else table[ref.id] = next;
  }
  if (plan.meta !== undefined) draft.meta = plan.meta;
}
