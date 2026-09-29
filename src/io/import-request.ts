/**
 * Turns an `ImportPlanRequest` (what the user chose) into a complete, checked plan input: defaults are the non-destructive
 * choice (docs/PERSISTENCE.md §6) — `merge`, an identical record → `identical_skip`, a different one → `keep_current`, nothing
 * excluded. A request that contradicts the analysis (an unknown ID, `identical_skip` for a record that differs, resolutions in
 * `replace_all`, a record both excluded and resolved) is refused as a value, never bent into something the user did not ask for.
 */
import type { AnyRecord, RecordRef } from '@/core/schema';
import type { ConflictResolution, ImportPlanRequest } from './contracts';
import type { ConflictAnalysis } from './import-conflicts';

const RESOLUTIONS: readonly ConflictResolution[] = ['identical_skip', 'keep_current', 'replace', 'import_as_copy'];

export interface ResolvedRequest {
  readonly mode: 'replace_all' | 'merge';
  /** One entry per incoming ID that exists live, defaults applied (merge mode; empty in `replace_all`). */
  readonly resolutions: ReadonlyMap<string, ConflictResolution>;
  readonly excluded: ReadonlySet<string>;
  /** `excluded` as references, sorted by kind order then ID (the order of `analysis.incoming`). */
  readonly excludedRefs: readonly RecordRef[];
}

export type ResolveRequestOutcome = { readonly ok: true; readonly value: ResolvedRequest } | { readonly ok: false; readonly message: string };

export function resolveRequest(request: ImportPlanRequest | undefined, analysis: ConflictAnalysis): ResolveRequestOutcome {
  const mode = request?.mode ?? 'merge';
  if (mode !== 'merge' && mode !== 'replace_all') return { ok: false, message: `unknown import mode "${String(mode)}"` };

  const incomingById = new Map<string, AnyRecord>(analysis.incoming.map((record) => [record.id, record] as const));
  const excluded = new Set<string>();
  for (const ref of request?.excluded ?? []) {
    const record = incomingById.get(ref.id);
    if (record === undefined || record.kind !== ref.kind) return { ok: false, message: `cannot exclude ${ref.kind} ${ref.id}: it is not in the import` };
    excluded.add(ref.id);
  }
  const excludedRefs = analysis.incoming.filter((record) => excluded.has(record.id)).map((record) => ({ kind: record.kind, id: record.id }) as RecordRef);

  const chosen = new Map<string, ConflictResolution>();
  for (const { id, resolution } of request?.resolutions ?? []) {
    if (mode === 'replace_all') return { ok: false, message: 'replace_all replaces the whole dataset: there are no per-record resolutions to choose' };
    if (!RESOLUTIONS.includes(resolution)) return { ok: false, message: `unknown resolution "${String(resolution)}" for ${id}` };
    if (chosen.has(id)) return { ok: false, message: `${id} was given more than one resolution` };
    chosen.set(id, resolution);
  }

  const resolutions = new Map<string, ConflictResolution>();
  if (mode === 'merge') {
    const conflictById = new Map<string, ConflictAnalysis["conflicts"][number]>(analysis.conflicts.map((entry) => [entry.incoming.id, entry] as const));
    for (const id of chosen.keys()) {
      const entry = conflictById.get(id);
      if (entry === undefined) return { ok: false, message: `${id} is not an incoming record whose ID already exists, so it has nothing to resolve` };
      if (excluded.has(id)) return { ok: false, message: `${id} is both excluded and given a resolution` };
      if (chosen.get(id) === 'identical_skip' && !entry.identical) return { ok: false, message: `${id} differs from the current record, so it cannot be skipped as identical` };
    }
    for (const entry of analysis.conflicts) {
      resolutions.set(entry.incoming.id, chosen.get(entry.incoming.id) ?? (entry.identical ? 'identical_skip' : 'keep_current'));
    }
  }
  return { ok: true, value: { mode, resolutions, excluded, excludedRefs } };
}
