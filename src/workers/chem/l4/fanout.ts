/**
 * Which records a change makes it necessary to re-check although they were not edited (reviewer's follow-up b, step 4.3b):
 *   - a species whose check signature changed (structure, formula, charge, listed classes, descriptors), created or deleted: the
 *     REACTIONS that refer to it (CHEM-005 reads the structures of its participants and products). A reaction whose plan came out
 *     the same is skipped by the reaction job without asking the worker. Mechanisms are not queued: their checks read only the
 *     structures embedded in their own steps, so a species record cannot change their answer.
 *   - a class created, deleted, or whose SMARTS or parents changed: the species that list it or one of its descendants
 *     (CHEM-007 reads the stated classes, ancestors included). Read from the ChangeSet's patches; a `replace` changes everything
 *     and is `checkAll`'s job.
 * Pure over the ports; the result is sorted and without duplicates, so what is queued first is deterministic.
 */
import type { ChangeSet } from '@/core/dataset/contracts';
import type { RecordRef } from '@/core/schema';
import type { L4Ports } from './contracts';
import { refKey } from './context';

/** Most fan-out records one change puts in the queue at once; the rest wait behind them (never dropped). */
export const RECHECK_CAP = 500;

/** Ids of the classes a change created, deleted, or changed in something CHEM-007 reads (SMARTS, parents). */
export function classesReadByChecks(changes: ChangeSet): readonly string[] {
  const ids = new Set<string>();
  for (const ref of [...changes.created, ...changes.deleted]) if (ref.kind === 'class') ids.add(ref.id);
  if (changes.cause === 'replace') return [...ids];
  for (const patch of changes.patches) {
    const [root, table, id, field, sub] = patch.path;
    if (root !== 'records' || table !== 'class' || typeof id !== 'string') continue;
    const whole = field === undefined;
    if (whole || field === 'parentIds' || (field === 'generic' && (sub === undefined || sub === 'smarts'))) ids.add(id);
  }
  return [...ids];
}

const byKey = (a: RecordRef, b: RecordRef): number => {
  const [x, y] = [refKey(a), refKey(b)];
  return x < y ? -1 : x > y ? 1 : 0;
};

/** The reactions that refer to any of the species. */
export function reactionsReferring(ports: L4Ports, speciesIds: readonly string[]): RecordRef[] {
  if (speciesIds.length === 0) return [];
  const indexes = ports.indexes();
  const out = new Map<string, RecordRef>();
  for (const id of speciesIds) {
    for (const referrer of indexes.referrersOf(id)) {
      if (referrer.owner.kind === 'reaction') out.set(refKey(referrer.owner), { kind: 'reaction', id: referrer.owner.id });
    }
  }
  return [...out.values()].sort(byKey);
}

/** The species that list any of the classes or a descendant of one. */
export function speciesListingClasses(ports: L4Ports, classIds: readonly string[]): RecordRef[] {
  if (classIds.length === 0) return [];
  const indexes = ports.indexes();
  const out = new Map<string, RecordRef>();
  for (const id of classIds) {
    for (const classId of [id, ...indexes.descendantsOf('class', id)]) {
      for (const referrer of indexes.referrersOf(classId)) {
        if (referrer.owner.kind === 'species' && referrer.path.startsWith('classIds')) out.set(refKey(referrer.owner), { kind: 'species', id: referrer.owner.id });
      }
    }
  }
  return [...out.values()].sort(byKey);
}
