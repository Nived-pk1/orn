/**
 * Helpers for rule tests: edit a fixture state through the same Immer path the store will use, and run
 * one catalogue rule (or the whole validator) over the result. Test-only.
 */
import { coreIndexEngine } from '@/core/indexes/engine';
import { RECORD_KINDS, type AnyRecord, type CanonicalState, type RecordByKind, type RecordKind, type RecordRef } from '@/core/schema';
import { RULES, runRules, validator, type Finding } from '@/core/validation';
import { commit, must, remove } from './state-fixture';

export type Mutable<T> = T extends string | number | boolean | null | undefined
  ? T
  : T extends readonly (infer U)[]
    ? Mutable<U>[]
    : { -readonly [P in keyof T]: Mutable<T[P]> };

/** Deep copy that also works on Immer drafts (structuredClone does not). */
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** A new state with one record changed by `mutate` (which may also return nothing). */
export function edit<K extends RecordKind>(
  state: CanonicalState,
  kind: K,
  id: string,
  mutate: (record: Mutable<RecordByKind[K]>) => void,
): CanonicalState {
  return commit(state, 1, (tables) => {
    mutate(must(tables[kind][id], `${kind} ${id}`) as Mutable<RecordByKind[K]>);
  }).after;
}

export function add<K extends RecordKind>(state: CanonicalState, kind: K, record: RecordByKind[K]): CanonicalState {
  return commit(state, 1, (tables) => {
    (tables[kind] as Record<string, unknown>)[record.id] = clone(record);
  }).after;
}

export function drop(state: CanonicalState, kind: RecordKind, id: string): CanonicalState {
  return commit(state, 1, (tables) => remove(tables, kind, id)).after;
}

export const recordOf = <K extends RecordKind>(state: CanonicalState, kind: K, id: string): RecordByKind[K] =>
  must((state.records[kind] as Readonly<Record<string, RecordByKind[K]>>)[id], `${kind} ${id}`);

/** A structural copy of a record under a new ID, for building duplicates and neighbours. */
export function cloneAs<T extends AnyRecord>(record: T, id: string): T {
  return { ...clone(record), id };
}

/** Findings of rule `ruleId` for every record of the state, or only for `subject`. */
export function ruleFindings(ruleId: string, state: CanonicalState, subject?: RecordRef): Finding[] {
  const rule = must(RULES.find((r) => r.id === ruleId), `rule ${ruleId}`);
  const ctx = { state, indexes: coreIndexEngine.build(state) };
  const records: AnyRecord[] =
    subject === undefined
      ? RECORD_KINDS.flatMap((kind) => Object.values(state.records[kind] as Record<string, AnyRecord>))
      : [recordOf(state, subject.kind, subject.id)];
  return records.flatMap((record) => [...runRules([rule], record, ctx)]);
}

export const validateEverything = (state: CanonicalState): readonly Finding[] =>
  validator.validateAll(state, coreIndexEngine.build(state));
