/**
 * Helpers for tests of the canonical store: a seeded RNG, a deterministic ID/clock context, a store over
 * a fixture, and a dispatch that fails the test with the reason when a command is rejected. Test-only.
 */
import { createCanonicalStore, type StoreHandle, type StoreOptions } from '@/core/commands';
import type { CommandEnvelope, CommandContext, CommitResult, DomainCommand } from '@/core/commands';
import { createIdFactory } from '@/core/dataset';
import type { AnyRecord, CanonicalState, RecordKind, RecordRef } from '@/core/schema';
import { loadFixtureState } from './state-fixture';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function testContext(seed = 1): CommandContext {
  const rng = mulberry32(seed);
  return createIdFactory({ nowMs: () => 1_790_000_000_000 }, { next: rng });
}

export function makeStore(
  state: CanonicalState = loadFixtureState('maximal-valid'),
  options: Partial<StoreOptions> = {},
): StoreHandle {
  return createCanonicalStore({ initial: state, ...options });
}

export const envelope = (label: string, ...commands: DomainCommand[]): CommandEnvelope => ({ label, commands });

export function mustCommit(result: CommitResult, what = 'command'): Extract<CommitResult, { ok: true }> {
  if (!result.ok) {
    throw new Error(`${what} was rejected: ${result.error.code} ${result.error.message} ${JSON.stringify(result.error.findings ?? [])}`);
  }
  return result;
}

export function recordIn<T extends AnyRecord = AnyRecord>(state: CanonicalState, kind: RecordKind, id: string): T {
  const record = (state.records[kind] as Readonly<Record<string, AnyRecord>>)[id];
  if (record === undefined) throw new Error(`missing ${kind} ${id}`);
  return record as T;
}

export const ref = (kind: RecordKind, id: string): RecordRef => ({ kind, id }) as RecordRef;

/** A record with some top-level fields replaced (shallow). */
export const withFields = <T extends AnyRecord>(record: T, fields: Record<string, unknown>): T => ({ ...record, ...fields }) as T;
