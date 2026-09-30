/**
 * The transformation records of a legacy import (step 3.11b, docs/MIGRATION.md §4.5): a reaction's `transformation.fgFrom` /
 * `fgTo` name functional groups; the classes standing for them (a hub class or a class made from the group, step 3.10) form a
 * FROM set and a TO set. A transformation with the same two sets is one record (matched by class sets, not by text); else one is
 * created, published and `review_required`. `bondChanges` is the record's `bondChangeSummary`: the first non-empty text stays, and a
 * different text from a later reaction is reported back to the caller, never overwritten.
 */
import { NameTextSchema, type Transformation } from '@/core/schema';
import { provenanceOf, reviewOf, type Stamp } from './compound-records';
import type { LegacyIdSpace } from './id-space';

export interface TransformationRequest {
  /** The functional-group ids as the reaction lists them (the ID is made from these, first occurrence wins). */
  readonly fgFrom: readonly string[];
  readonly fgTo: readonly string[];
  readonly fromClassIds: readonly string[];
  readonly toClassIds: readonly string[];
  /** A valid `bondChangeSummary`, or undefined. */
  readonly bondChanges: string | undefined;
}

export interface TransformationResult {
  readonly id: string;
  /** False when the record already had another bond-change text: the caller keeps this reaction's text in `unmapped`. */
  readonly bondStored: boolean;
}

export interface TransformationBook {
  resolve(request: TransformationRequest): TransformationResult;
  records(): Transformation[];
}

const sorted = (ids: readonly string[]): string[] => [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

export function createTransformationBook(input: { ids: LegacyIdSpace; stamp: Stamp; classNames: ReadonlyMap<string, string> }): TransformationBook {
  const made = new Map<string, Transformation>();
  const nameOf = (ids: readonly string[]): string => ids.map((id) => input.classNames.get(id) ?? id).join(' + ');
  return {
    resolve(request) {
      const from = sorted(request.fromClassIds);
      const to = sorted(request.toClassIds);
      const key = JSON.stringify([from, to]);
      const existing = made.get(key);
      if (existing !== undefined) {
        if (request.bondChanges === undefined) return { id: existing.id, bondStored: true };
        if (existing.bondChangeSummary === undefined) {
          made.set(key, { ...existing, bondChangeSummary: request.bondChanges });
          return { id: existing.id, bondStored: true };
        }
        return { id: existing.id, bondStored: existing.bondChangeSummary === request.bondChanges };
      }
      const id = input.ids.transformationId(request.fgFrom, request.fgTo);
      const named = `${nameOf(from)} → ${nameOf(to)}`;
      const name = NameTextSchema.safeParse(named).success ? named : `Legacy transformation ${made.size + 1}`;
      made.set(key, {
        id: id as Transformation['id'],
        kind: 'transformation',
        name,
        aliases: [],
        fromClassIds: from as Transformation['fromClassIds'],
        toClassIds: to as Transformation['toClassIds'],
        ...(request.bondChanges === undefined ? {} : { bondChangeSummary: request.bondChanges }),
        conceptIds: [],
        tags: [],
        citations: [],
        provenance: provenanceOf(input.stamp, undefined),
        review: reviewOf([]),
      });
      return { id, bondStored: true };
    },
    records() {
      return [...made.values()].map((record) => ({
        ...record,
        review: reviewOf(['created from the functional-group fields (fgFrom, fgTo) of legacy reactions and matched by class sets: check the classes and the direction']),
      }));
    },
  };
}
