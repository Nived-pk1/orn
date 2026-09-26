/**
 * `replaceState` support: structural checks on a wholesale replacement and the patches that describe it.
 * A replacement is not a command, but consumers that follow ChangeSets by patches (worker replicas,
 * persistence) must still be able to reproduce it, so the patches replace the changed tables.
 */
import type { Patch } from 'immer';
import { DatasetMetaSchema, RECORD_KINDS, type AnyRecord, type CanonicalState } from '../schema';
import type { CommandError } from './contracts';
import { jsonEqual } from './lookup';

/** Why `next` cannot be a canonical state at all (before any record-level validation), or undefined. */
export function shapeProblem(next: CanonicalState): CommandError | undefined {
  const meta = DatasetMetaSchema.safeParse(next.meta);
  if (!meta.success) {
    const first = meta.error.issues[0];
    return { code: 'VALIDATION_FAILED', message: `Invalid dataset metadata: ${first?.path.join('.') ?? 'meta'}: ${first?.message ?? 'invalid'}` };
  }
  for (const kind of RECORD_KINDS) {
    const table = (next.records as Partial<Record<string, Readonly<Record<string, AnyRecord>>>>)[kind];
    if (typeof table !== 'object' || table === null) {
      return { code: 'VALIDATION_FAILED', message: `The state has no "${kind}" table.` };
    }
    for (const id of Object.keys(table)) {
      const record = table[id] as AnyRecord | undefined;
      if (record === undefined || record.id !== id || record.kind !== kind) {
        return { code: 'VALIDATION_FAILED', message: `The "${kind}" table holds a record under the wrong key or kind ("${id}").` };
      }
    }
  }
  return undefined;
}

/** Patches that turn `from` into `to`: one replace per changed table, plus meta. */
export function replacementPatches(from: CanonicalState, to: CanonicalState): Patch[] {
  const patches: Patch[] = [];
  if (!jsonEqual(from.meta, to.meta)) patches.push({ op: 'replace', path: ['meta'], value: to.meta });
  for (const kind of RECORD_KINDS) {
    if (from.records[kind] !== to.records[kind]) {
      patches.push({ op: 'replace', path: ['records', kind], value: to.records[kind] });
    }
  }
  return patches;
}
