/**
 * Finding store: the derived, replaceable set of findings (INV-11, INV-24). It holds no records and
 * never touches them. Findings are replaced per (subject, level), so a re-validated record whose
 * problem was fixed simply loses its finding. Snapshots handed out are stable arrays that change
 * identity only when content changes, which suits `useSyncExternalStore`.
 */
import type { RecordRef } from '../schema';
import type { Finding, FindingStore, Severity, ValidationLevel } from './contracts';

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const keyOf = (ref: RecordRef): string => `${ref.kind}:${ref.id}`;
const byPosition = (a: Finding, b: Finding): number =>
  compare(a.subject.id, b.subject.id) ||
  compare(a.ruleId, b.ruleId) ||
  compare(a.path ?? '', b.path ?? '') ||
  compare(a.id, b.id);
const EMPTY: readonly Finding[] = Object.freeze([]);
const NO_COUNTS: Readonly<Record<Severity, number>> = Object.freeze({ error: 0, warning: 0, info: 0, review_required: 0 });

function sameFindings(a: readonly Finding[], b: readonly Finding[]): boolean {
  return a.length === b.length && a.every((finding, i) => JSON.stringify(finding) === JSON.stringify(b[i]));
}

export function createFindingStore(): FindingStore {
  /** subject key → level → findings (sorted). */
  const table = new Map<string, Map<ValidationLevel, readonly Finding[]>>();
  const listeners = new Set<() => void>();
  const perSubject = new Map<string, readonly Finding[]>();
  let sorted: readonly Finding[] | undefined;
  let tally: Readonly<Record<Severity, number>> = NO_COUNTS;

  const recount = (): void => {
    sorted = undefined;
    const counts: Record<Severity, number> = { ...NO_COUNTS };
    for (const levels of table.values()) {
      for (const list of levels.values()) for (const finding of list) counts[finding.severity] += 1;
    }
    tally = Object.freeze(counts);
  };

  const assertBelongs = (finding: Finding, level: ValidationLevel, subjects: ReadonlySet<string>): void => {
    if (finding.level !== level) throw new TypeError(`Finding ${finding.id} is level ${finding.level}, not ${level}`);
    if (!subjects.has(keyOf(finding.subject))) throw new TypeError(`Finding ${finding.id} is not about a listed subject`);
  };

  const notify = (): void => {
    let failure: unknown;
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        failure ??= error;
      }
    }
    if (failure !== undefined) throw failure;
  };

  return {
    replaceForSubjects(subjects, findings, level) {
      const keys = new Set(subjects.map(keyOf));
      const grouped = new Map<string, Finding[]>();
      for (const finding of findings) {
        assertBelongs(finding, level, keys);
        const key = keyOf(finding.subject);
        grouped.set(key, [...(grouped.get(key) ?? []), finding]);
      }
      let changed = false;
      for (const key of keys) {
        const next = Object.freeze([...(grouped.get(key) ?? [])].sort(byPosition));
        const levels = table.get(key) ?? new Map<ValidationLevel, readonly Finding[]>();
        if (sameFindings(levels.get(level) ?? EMPTY, next)) continue;
        changed = true;
        perSubject.delete(key);
        if (next.length > 0) levels.set(level, next);
        else levels.delete(level);
        if (levels.size > 0) table.set(key, levels);
        else table.delete(key);
      }
      if (!changed) return;
      recount();
      notify();
    },

    bySubject(ref) {
      const key = keyOf(ref);
      const cached = perSubject.get(key);
      if (cached !== undefined) return cached;
      const levels = table.get(key);
      const list = levels === undefined ? EMPTY : Object.freeze([...levels.values()].flat().sort(byPosition));
      perSubject.set(key, list);
      return list;
    },

    all(filter) {
      sorted ??= Object.freeze([...table.values()].flatMap((levels) => [...levels.values()].flat()).sort(byPosition));
      if (filter === undefined) return sorted;
      return sorted.filter(
        (f) =>
          (filter.severity === undefined || f.severity === filter.severity) &&
          (filter.level === undefined || f.level === filter.level),
      );
    },

    counts: () => tally,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
