/**
 * What the L4 jobs share: the ports, the not-checkable memory, the derived CHEM-009 groups, the statuses, the signature of the last
 * request sent per subject (for the stale-result test) and the counters. One per service; nothing here is exported outside it.
 */
import type { CheckDraft } from '@/chem/checks/contracts';
import type { ToolkitIdentity } from '@/chem/checks/contracts';
import { toFinding } from '@/chem/checks/rules';
import type { RecordRef } from '@/core/schema';
import type { CheckCall } from '../client';
import { createGroups, type Groups } from './groups';
import { createNotCheckableMemory, type NotCheckableMemory } from './memory';
import { NOT_CHECKABLE_CAP, type L4Ports, type L4Stats, type SubjectStatus } from './contracts';

export type Method = keyof L4Stats['calls'];

export interface Entry {
  readonly subject: RecordRef;
  readonly draft: CheckDraft;
}

export const refKey = (ref: RecordRef): string => `${ref.kind}:${ref.id}`;

export interface L4Context {
  readonly ports: L4Ports;
  readonly memory: NotCheckableMemory;
  readonly groups: Groups;
  /** Signature of the request last sent for a subject (`kind:id`). */
  readonly sent: Map<string, string>;
  version(): string;
  noteToolkit(toolkit: ToolkitIdentity): void;
  /** `true` when a toolkit version is known that makes "remember it" meaningful (it is not `not loaded`). */
  canRemember(): boolean;
  setStatus(ref: RecordRef, status: SubjectStatus): void;
  forget(ref: RecordRef): void;
  statusOf(ref: RecordRef): SubjectStatus;
  /** Replaces, for `subjects`, their findings of `ruleIds` with `entries` (a subject with none has them cleared). */
  merge(subjects: readonly RecordRef[], ruleIds: readonly string[], entries: readonly Entry[]): void;
  /** Counts the call and makes it. */
  call<T>(method: Method, items: number, run: () => Promise<CheckCall<T>>): Promise<CheckCall<T>>;
  countStale(): void;
  countRemembered(): void;
  stats(): L4Stats;
  subscribe(listener: () => void): () => void;
  dispose(): void;
  disposed(): boolean;
}

export function createContext(ports: L4Ports): L4Context {
  const statuses = new Map<string, SubjectStatus>();
  const listeners = new Set<() => void>();
  const calls: Record<Method, number> = { checkSpecies: 0, checkReaction: 0, checkMechanism: 0, matches: 0 };
  const items: Record<Method, number> = { checkSpecies: 0, checkReaction: 0, checkMechanism: 0, matches: 0 };
  let stale = 0;
  let remembered = 0;
  let version = 'unknown';
  let done = false;
  const tell = (): void => {
    for (const listener of [...listeners]) listener();
  };
  return {
    ports,
    memory: createNotCheckableMemory(NOT_CHECKABLE_CAP),
    groups: createGroups(),
    sent: new Map(),
    version: () => version,
    noteToolkit: (toolkit) => void (version = toolkit.version),
    canRemember: () => version !== 'not loaded',
    setStatus(ref, status) {
      statuses.set(refKey(ref), status);
      tell();
    },
    forget(ref) {
      statuses.delete(refKey(ref));
      this.sent.delete(refKey(ref));
      tell();
    },
    statusOf: (ref) => statuses.get(refKey(ref)) ?? { state: 'none' },
    merge(subjects, ruleIds, entries) {
      if (subjects.length === 0) return;
      ports.findings.replaceForRules(
        subjects,
        ruleIds,
        entries.map((entry) => toFinding(entry.draft.ruleId, entry.subject, entry.draft)),
      );
    },
    call(method, count, run) {
      calls[method] += 1;
      items[method] += count;
      return run();
    },
    countStale: () => void (stale += 1),
    countRemembered: () => void (remembered += 1),
    stats: () => ({ calls: { ...calls }, items: { ...items }, staleDropped: stale, rememberedSkipped: remembered }),
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    dispose: () => void (done = true),
    disposed: () => done,
  };
}
