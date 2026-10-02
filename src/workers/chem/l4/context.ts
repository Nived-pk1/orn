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
  /** Learns (or, with `undefined`, drops) a species' derived formula; listeners are told, once per run, by `flushFormulas`. */
  setFormula(id: string, formula: string | undefined): void;
  formulaOf(id: string): string | undefined;
  /** Tells the formula listeners the ids whose formula changed since the last call. */
  flushFormulas(): void;
  subscribeFormulas(listener: (ids: readonly string[]) => void): () => void;
  /** Tells the status listeners (work was queued, a run ended) without a status having changed. */
  announce(): void;
  counts(): { readonly pending: number; readonly notChecked: number };
  forget(ref: RecordRef): void;
  statusOf(ref: RecordRef): SubjectStatus;
  /** Replaces, for `subjects`, their findings of `ruleIds` with `entries` (a subject with none has them cleared). */
  merge(subjects: readonly RecordRef[], ruleIds: readonly string[], entries: readonly Entry[]): void;
  /** Counts the call and makes it. */
  call<T>(method: Method, items: number, run: () => Promise<CheckCall<T>>): Promise<CheckCall<T>>;
  countStale(): void;
  countRemembered(): void;
  /** One change queued `now` referrer records at once (and `total` of them in all, the rest behind the cap). */
  countReferrers(now: number, total: number): void;
  stats(): L4Stats;
  /** The service tells where to read how many referrers wait behind the cap. */
  watchBacklog(size: () => number): void;
  subscribe(listener: () => void): () => void;
  dispose(): void;
  disposed(): boolean;
}

export function createContext(ports: L4Ports): L4Context {
  const statuses = new Map<string, SubjectStatus>();
  const listeners = new Set<() => void>();
  const formulas = new Map<string, string>();
  const formulaListeners = new Set<(ids: readonly string[]) => void>();
  const formulaChanged = new Set<string>();
  const counted = { pending: 0, notChecked: 0 };
  const count = (status: SubjectStatus | undefined, by: 1 | -1): void => {
    if (status?.state === 'pending') counted.pending += by;
    else if (status?.state === 'not_checked') counted.notChecked += by;
  };
  const calls: Record<Method, number> = { checkSpecies: 0, checkReaction: 0, checkMechanism: 0, matches: 0 };
  const items: Record<Method, number> = { checkSpecies: 0, checkReaction: 0, checkMechanism: 0, matches: 0 };
  let stale = 0;
  let remembered = 0;
  let backlogSize = (): number => 0;
  let queued = 0;
  let maxAtOnce = 0;
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
      count(statuses.get(refKey(ref)), -1);
      statuses.set(refKey(ref), status);
      count(status, 1);
      tell();
    },
    setFormula(id, formula) {
      if (formulas.get(id) === formula) return;
      if (formula === undefined) formulas.delete(id);
      else formulas.set(id, formula);
      formulaChanged.add(id);
    },
    formulaOf: (id) => formulas.get(id),
    flushFormulas() {
      if (formulaChanged.size === 0) return;
      const ids = [...formulaChanged].sort();
      formulaChanged.clear();
      for (const listener of [...formulaListeners]) listener(ids);
    },
    subscribeFormulas(listener) {
      formulaListeners.add(listener);
      return () => void formulaListeners.delete(listener);
    },
    announce: tell,
    counts: () => ({ ...counted }),
    forget(ref) {
      count(statuses.get(refKey(ref)), -1);
      statuses.delete(refKey(ref));
      this.sent.delete(refKey(ref));
      if (ref.kind === 'species') this.setFormula(ref.id, undefined);
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
    countReferrers(now, total) {
      queued += total;
      maxAtOnce = Math.max(maxAtOnce, now);
    },
    watchBacklog: (size) => void (backlogSize = size),
    stats: () => ({ calls: { ...calls }, items: { ...items }, staleDropped: stale, rememberedSkipped: remembered, referrerQueued: queued, maxQueuedAtOnce: maxAtOnce, backlog: backlogSize() }),
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    dispose: () => void (done = true),
    disposed: () => done,
  };
}
