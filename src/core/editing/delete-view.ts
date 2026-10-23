/**
 * A delete in words, computed BEFORE anything changes (step 6.8a, D1): from the reference registry's delete policies through the delete
 * dry run - "Removed from" (detach), "Deleted with it" (cascade), "Blocks the delete" (restrict) - and the number of rich-text [[links]] that
 * are left as they are (REF-008 shows them afterwards). `deleteEnvelope` is the delete itself: ONE envelope, so ONE undo step. Pure; no
 * chemistry and no kind or field is named here: the registry decides.
 */
import type { CommandEnvelope } from '../commands/contracts';
import { computeDeleteImpact, removedIds } from '../commands/impact';
import { recordAt } from '../commands/lookup';
import type { CoreIndexes } from '../indexes/contracts';
import { countRecordRichTextLinks } from '../references';
import type { Referrer } from '../references/contracts';
import type { CanonicalState, RecordRef } from '../schema';
import { nameOfRef } from './labels';
import { referenceFieldWords } from './schema-words';

export interface DeleteRow {
  readonly ref: RecordRef;
  readonly name: string;
  /** The fields of this record that point at the deleted one, in words (empty for "Deleted with it"). */
  readonly fields: readonly string[];
}

export interface DeleteView {
  readonly targets: readonly { readonly ref: RecordRef; readonly name: string }[];
  /** detach: the link will be removed from these records. */
  readonly removedFrom: readonly DeleteRow[];
  /** cascade: these records are deleted with it. */
  readonly deletedWith: readonly DeleteRow[];
  /** restrict: the delete is unavailable until none is left. */
  readonly blocks: readonly DeleteRow[];
  /** `[[links]]` in other records' rich text that will point at nothing (they are left as they are). */
  readonly softLinks: number;
  readonly canDelete: boolean;
}

function rowsOf(state: CanonicalState, referrers: readonly Referrer[]): DeleteRow[] {
  const byOwner = new Map<string, { ref: RecordRef; fields: string[] }>();
  for (const referrer of referrers) {
    const key = `${referrer.owner.kind}:${referrer.owner.id}`;
    const row = byOwner.get(key) ?? { ref: referrer.owner, fields: [] };
    const words = referenceFieldWords(referrer.path);
    if (!row.fields.includes(words)) row.fields.push(words);
    byOwner.set(key, row);
  }
  return [...byOwner.values()].map((row) => ({ ref: row.ref, name: nameOfRef(state, row.ref), fields: row.fields }));
}

export function deleteView(state: CanonicalState, indexes: CoreIndexes, refs: readonly RecordRef[]): DeleteView {
  const impact = computeDeleteImpact(state, indexes, refs);
  const gone = removedIds(state, impact);
  const linking = new Map<string, RecordRef>();
  for (const id of gone) for (const owner of indexes.linkersOf(id)) if (!gone.has(owner.id)) linking.set(owner.id, owner);
  let softLinks = 0;
  for (const owner of linking.values()) {
    const record = recordAt(state, owner);
    if (record !== undefined) softLinks += countRecordRichTextLinks(record, gone);
  }
  const blocks = rowsOf(state, impact.blockedBy);
  return {
    targets: impact.targets.map((ref) => ({ ref, name: nameOfRef(state, ref) })),
    removedFrom: rowsOf(state, impact.detaches),
    deletedWith: impact.cascades.map((ref) => ({ ref, name: nameOfRef(state, ref), fields: [] })),
    blocks,
    softLinks,
    canDelete: blocks.length === 0,
  };
}

/** The delete as ONE envelope: "Undo delete <name>" is one step that restores every record it changed. */
export function deleteEnvelope(state: CanonicalState, refs: readonly RecordRef[]): CommandEnvelope {
  const names = refs.map((ref) => nameOfRef(state, ref));
  return {
    label: refs.length === 1 ? `delete ${names[0]}` : `delete ${refs.length} records`,
    commands: refs.map((ref) => ({ type: 'record.delete' as const, ref, mode: 'apply_cascade' as const })),
  };
}
