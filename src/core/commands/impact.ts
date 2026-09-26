/**
 * Delete-impact dry run (docs/DOMAIN_MODEL.md §4), generic over the reference registry through the
 * reverse-reference index. Nothing here names a kind or a field.
 *
 * Deleting a record also removes the nested IDs it defines, so references to those (a route step's
 * `outcomeId`, a scheme placement's `participantId`) count as references to the deleted record.
 * `cascade` references delete their owner, which is then processed like any other deleted record, so
 * the closure is transitive. It is bounded by the number of records: each is visited once.
 */
import type { CanonicalState, RecordRef } from '../schema';
import type { CoreIndexes } from '../indexes/contracts';
import { referenceEngine } from '../references';
import type { DeleteImpact, Referrer } from '../references/contracts';
import { compareIds } from '../dataset/document';
import { byRef, recordAt, refKey } from './lookup';

const byReferrer = (a: Referrer, b: Referrer): number =>
  byRef(a.owner, b.owner) || compareIds(a.path, b.path) || compareIds(a.targetId, b.targetId);

const referrerKey = (r: Referrer): string => `${refKey(r.owner)}\0${r.path}\0${r.targetId}`;

/**
 * `targets` are the requested refs, de-duplicated and sorted (missing records included, so the caller
 * can see what was asked; they contribute nothing to the closure). `blockedBy` lists restrict
 * references whose owners survive; `detaches` lists detach references on surviving owners.
 */
export function computeDeleteImpact(
  state: CanonicalState,
  indexes: CoreIndexes,
  refs: readonly RecordRef[],
): DeleteImpact {
  const targets = [...new Map(refs.map((ref) => [refKey(ref), ref] as const)).values()].sort(byRef);
  const doomed = new Map<string, RecordRef>();
  const queue: RecordRef[] = [];
  const enqueue = (ref: RecordRef): void => {
    if (doomed.has(ref.id) || recordAt(state, ref) === undefined) return;
    doomed.set(ref.id, ref);
    queue.push(ref);
  };
  for (const target of targets) enqueue(target);

  const inbound = new Map<string, Referrer>();
  for (let i = 0; i < queue.length; i += 1) {
    const ref = queue[i] as RecordRef;
    const record = recordAt(state, ref);
    if (record === undefined) continue;
    const ids = new Set([record.id, ...referenceEngine.nestedIds(record).map((nested) => nested.id)]);
    for (const id of ids) {
      for (const referrer of indexes.referrersOf(id)) {
        if (referrer.owner.id === ref.id) continue;
        inbound.set(referrerKey(referrer), referrer);
        if (referrer.onDelete === 'cascade') enqueue(referrer.owner);
      }
    }
  }

  const surviving = [...inbound.values()].filter((referrer) => !doomed.has(referrer.owner.id)).sort(byReferrer);
  const targetIds = new Set(targets.map((target) => target.id));
  return {
    targets,
    blockedBy: surviving.filter((referrer) => referrer.onDelete === 'restrict'),
    cascades: [...doomed.values()].filter((ref) => !targetIds.has(ref.id)).sort(byRef),
    detaches: surviving.filter((referrer) => referrer.onDelete === 'detach'),
  };
}

/** Record IDs and nested IDs that disappear when the impact's targets and cascades are deleted. */
export function removedIds(state: CanonicalState, impact: DeleteImpact): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const ref of [...impact.targets, ...impact.cascades]) {
    const record = recordAt(state, ref);
    if (record === undefined) continue;
    ids.add(record.id);
    for (const nested of referenceEngine.nestedIds(record)) ids.add(nested.id);
  }
  return ids;
}

export const isEmptyImpact = (impact: DeleteImpact): boolean =>
  impact.blockedBy.length === 0 && impact.cascades.length === 0 && impact.detaches.length === 0;
