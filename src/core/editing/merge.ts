/**
 * Merge A INTO B (ADR-040 addendum "Delete and merge", step 6.8a, D3). B survives. Every reference to A anywhere is rewritten to B (the
 * registry decides which fields; `referenceEngine.remap`), `[[A]]` links in rich text become `[[B]]`, A's name and aliases join B's aliases
 * (none repeated, none equal to B's name), tags, citations and every list field are joined without repeats, and each SCALAR field where A and
 * B differ is a choice (`keep` B's value, the default, or `take` A's) - nothing changes without the user's Merge. A is deleted in the same
 * envelope, so one Undo restores everything. A may be a draft that was never stored (the duplicate dialog): then only B changes. Pure; the
 * only kinds and fields named here are the nine mergeable kinds and the shared metadata (`names`, `aliases`, `tags`, `citations`).
 */
import type { CommandEnvelope, DomainCommand } from '../commands/contracts';
import { recordAt } from '../commands/lookup';
import type { CoreIndexes } from '../indexes/contracts';
import { referenceEngine, rewriteRecordRichTextLinks } from '../references';
import { type AnyRecord, type CanonicalState, type RecordKind, type RecordRef } from '../schema';
import { canonicalJson } from '../text/canonical-json';
import { fold } from '../text/normalizer';
import { nameOfRef } from './labels';
import { isUnstated, mergeFieldWords } from './merge-words';

export const MERGE_KINDS = ['species', 'class', 'reagent', 'concept', 'named_reaction', 'transformation', 'reference', 'topic', 'exam'] as const satisfies readonly RecordKind[];

const KIND_WORDS: Readonly<Record<string, string>> = { reference: 'source', navigator_anchor: 'map family' };
const kindPhrase = (kind: string): string => KIND_WORDS[kind] ?? kind.replace(/_/g, ' ');

export function isMergeable(kind: string): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  return (MERGE_KINDS as readonly string[]).includes(kind) ? { ok: true } : { ok: false, message: `Merging ${kindPhrase(kind)} is not offered; delete the copy instead.` };
}

export interface ScalarChoice {
  /** "notes", "names.iupac". */
  readonly path: string;
  /** The field in the editors' words ("Kind of species"). */
  readonly words: string;
  /** B's value (the survivor; selected first). */
  readonly into: unknown;
  /** A's value. */
  readonly from: unknown;
}

/** A field where only A has a real value: B takes it, no choice (W2). */
export interface FilledField {
  readonly path: string;
  readonly words: string;
  readonly value: unknown;
}

export type MergePick = 'keep' | 'take';

export type MergePreview =
  | {
      readonly ok: true;
      readonly scalars: readonly ScalarChoice[];
      /** Fields B lacked (empty or "unspecified") that A's real value fills. */
      readonly filled: readonly FilledField[];
      readonly fromName: string;
      /** Every record that will change (B included) and A, which is deleted when it is stored. */
      readonly changes: readonly { readonly ref: RecordRef; readonly name: string }[];
      readonly deleted: { readonly ref: RecordRef; readonly name: string } | undefined;
    }
  | { readonly ok: false; readonly message: string };

type Bag = Record<string, unknown>;
const isBag = (value: unknown): value is Bag => typeof value === 'object' && value !== null && !Array.isArray(value);
const same = (a: unknown, b: unknown): boolean => (a === undefined || b === undefined ? a === b : canonicalJson(a) === canonicalJson(b));
/** Keys that are never merged as scalars: identity, metadata (B's is kept) and the lists/names handled apart. */
const SPECIAL = new Set(['id', 'kind', 'names', 'tags', 'citations', 'provenance', 'review']);

function unionOf(into: readonly unknown[], from: readonly unknown[]): unknown[] {
  const seen = new Set(into.map((item) => canonicalJson(item) ?? ''));
  const out = [...into];
  for (const item of from) {
    const key = canonicalJson(item) ?? '';
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

/** Strings added to `into` without repeating one (folded) already there or equal to `name`. */
function joinNames(into: readonly string[], add: readonly string[], name: string): string[] {
  const seen = new Set([fold(name), ...into.map((one) => fold(one))]);
  const out = [...into];
  for (const one of add) {
    if (one === '' || seen.has(fold(one))) continue;
    seen.add(fold(one));
    out.push(one);
  }
  return out;
}

function nameParts(record: Bag): { readonly canonical: string; readonly others: readonly string[] } {
  const names = record['names'];
  if (isBag(names)) return { canonical: String(names['canonical'] ?? ''), others: [...((names['common'] as string[] | undefined) ?? []), ...((names['aliases'] as string[] | undefined) ?? [])] };
  return { canonical: typeof record['name'] === 'string' ? record['name'] : typeof record['title'] === 'string' ? record['title'] : '', others: Array.isArray(record['aliases']) ? (record['aliases'] as string[]) : [] };
}

/** The scalar fields where BOTH sides hold different real values (B's first), and the fields A's real value fills in on an empty B. */
function scalarsOf(from: Bag, into: Bag): { readonly choices: ScalarChoice[]; readonly filled: FilledField[] } {
  const choices: ScalarChoice[] = [];
  const filled: FilledField[] = [];
  const sort = (path: string, a: unknown, b: unknown): void => {
    if (same(a, b) || isUnstated(a)) return;
    if (isUnstated(b)) filled.push({ path, words: mergeFieldWords(path), value: a });
    else choices.push({ path, words: mergeFieldWords(path), into: b, from: a });
  };
  const hasAliases = Array.isArray(into['aliases']);
  for (const key of [...new Set([...Object.keys(into), ...Object.keys(from)])].sort()) {
    if (SPECIAL.has(key) || Array.isArray(into[key]) || Array.isArray(from[key])) continue;
    if (key === 'name' && hasAliases) continue; // A's name becomes an alias of B
    sort(key, from[key], into[key]);
  }
  const [fn, bn] = [isBag(from['names']) ? from['names'] : {}, isBag(into['names']) ? into['names'] : {}];
  for (const key of ['iupac', 'qualifier']) sort(`names.${key}`, fn[key], bn[key]);
  return { choices, filled };
}

function mergedRecord(from: Bag, into: Bag, picks: Readonly<Record<string, MergePick>>, now: string): Bag {
  const merged: Bag = { ...into };
  for (const key of Object.keys(from)) {
    if (SPECIAL.has(key)) continue;
    const [a, b] = [from[key], into[key]];
    if (Array.isArray(a) || Array.isArray(b)) merged[key] = unionOf(Array.isArray(b) ? b : [], Array.isArray(a) ? a : []);
  }
  const { choices, filled } = scalarsOf(from, into);
  for (const fill of filled) {
    if (fill.path.startsWith('names.')) merged['names'] = { ...(isBag(merged['names']) ? merged['names'] : {}), [fill.path.slice(6)]: fill.value };
    else merged[fill.path] = fill.value;
  }
  for (const choice of choices) {
    if (picks[choice.path] !== 'take') continue;
    if (choice.path.startsWith('names.')) {
      const key = choice.path.slice(6);
      const names = { ...(isBag(merged['names']) ? merged['names'] : {}) };
      if (choice.from === undefined) Reflect.deleteProperty(names, key);
      else names[key] = choice.from;
      merged['names'] = names;
    } else if (choice.from === undefined) Reflect.deleteProperty(merged, choice.path);
    else merged[choice.path] = choice.from;
  }
  merged['tags'] = unionOf((into['tags'] as unknown[] | undefined) ?? [], (from['tags'] as unknown[] | undefined) ?? []);
  merged['citations'] = unionOf((into['citations'] as unknown[] | undefined) ?? [], (from['citations'] as unknown[] | undefined) ?? []);
  const [a, b] = [nameParts(from), nameParts(into)];
  const added = [a.canonical, ...a.others];
  if (isBag(merged['names'])) {
    const names = merged['names'];
    const common = joinNames([], [...((names['common'] as string[] | undefined) ?? [])], b.canonical);
    const aliases = joinNames([...((names['aliases'] as string[] | undefined) ?? [])], [...((from['names'] as Bag)['common'] as string[] ?? []), ...added], b.canonical).filter((one) => !common.some((c) => fold(c) === fold(one)));
    merged['names'] = { ...names, common, aliases };
  } else if (Array.isArray(merged['aliases'])) {
    merged['aliases'] = joinNames(merged['aliases'] as string[], added, b.canonical);
  }
  const provenance = isBag(into['provenance']) ? into['provenance'] : undefined;
  if (provenance !== undefined) merged['provenance'] = { ...provenance, updatedAt: now };
  return merged;
}

/** Arrays of strings in which `id` appears more than once keep the first: a rewrite can make two entries the same. */
function dedupeId(value: unknown, id: string): unknown {
  if (Array.isArray(value)) {
    let seen = false;
    return value.flatMap((item) => {
      if (item === id) {
        if (seen) return [];
        seen = true;
      }
      return [dedupeId(item, id)];
    });
  }
  if (isBag(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, dedupeId(item, id)]));
  return value;
}

/** What the merge changes, as the commands of ONE envelope; shared by the preview and the envelope. */
function planned(state: CanonicalState, indexes: CoreIndexes, from: AnyRecord, into: RecordRef, picks: Readonly<Record<string, MergePick>>, now: string):
  | { readonly ok: true; readonly commands: readonly DomainCommand[]; readonly changed: readonly RecordRef[]; readonly scalars: readonly ScalarChoice[]; readonly filled: readonly FilledField[]; readonly stored: boolean }
  | { readonly ok: false; readonly message: string } {
  const allowed = isMergeable(from.kind);
  if (!allowed.ok) return allowed;
  if (from.kind !== into.kind) return { ok: false, message: 'A merge needs two records of the same kind.' };
  if (from.id === into.id) return { ok: false, message: 'A record cannot be merged into itself.' };
  const target = recordAt(state, into);
  if (target === undefined) return { ok: false, message: 'The record to keep is no longer there.' };
  const fromRef = { kind: from.kind, id: from.id } as RecordRef;
  const stored = recordAt(state, fromRef) !== undefined;
  const idMap = new Map([[from.id, into.id]]);
  const { choices: scalars, filled } = scalarsOf(from as unknown as Bag, target as unknown as Bag);
  let merged = mergedRecord(from as unknown as Bag, target as unknown as Bag, picks, now) as unknown as AnyRecord;
  merged = referenceEngine.detach(merged, new Set([from.id, into.id]));
  merged = rewriteRecordRichTextLinks(merged, idMap).record;
  const commands: DomainCommand[] = [];
  const changed: RecordRef[] = [];
  if (stored) {
    const owners = new Map<string, RecordRef>();
    for (const referrer of indexes.referrersOf(from.id)) if (referrer.owner.id !== from.id && referrer.owner.id !== into.id) owners.set(referrer.owner.id, referrer.owner);
    for (const linker of indexes.linkersOf(from.id)) if (linker.id !== from.id && linker.id !== into.id) owners.set(linker.id, linker);
    for (const owner of [...owners.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
      const before = recordAt(state, owner);
      if (before === undefined) continue;
      const after = rewriteRecordRichTextLinks(referenceEngine.remap(before, idMap), idMap).record;
      const deduped = dedupeId(after, into.id) as AnyRecord;
      if (canonicalJson(deduped) !== canonicalJson(before)) {
        commands.push({ type: 'record.update', record: deduped });
        changed.push(owner);
      }
    }
  }
  commands.push({ type: 'record.update', record: merged });
  changed.push(into);
  if (stored) commands.push({ type: 'record.delete', ref: fromRef, mode: 'restrict' });
  return { ok: true, commands, changed, scalars, filled, stored };
}

export function mergePreview(state: CanonicalState, indexes: CoreIndexes, from: AnyRecord, into: RecordRef): MergePreview {
  const plan = planned(state, indexes, from, into, {}, '1970-01-01T00:00:00.000Z');
  if (!plan.ok) return plan;
  return {
    ok: true,
    scalars: plan.scalars,
    filled: plan.filled,
    fromName: nameOf(from),
    changes: plan.changed.map((ref) => ({ ref, name: nameOfRef(state, ref) })),
    deleted: plan.stored ? { ref: { kind: from.kind, id: from.id } as RecordRef, name: nameOf(from) } : undefined,
  };
}

const nameOf = (record: AnyRecord): string => nameParts(record as unknown as Bag).canonical || record.id;

export function mergeEnvelope(
  state: CanonicalState,
  indexes: CoreIndexes,
  from: AnyRecord,
  into: RecordRef,
  picks: Readonly<Record<string, MergePick>>,
  now: string,
): { readonly ok: true; readonly envelope: CommandEnvelope } | { readonly ok: false; readonly message: string } {
  const plan = planned(state, indexes, from, into, picks, now);
  if (!plan.ok) return plan;
  return { ok: true, envelope: { label: `merge ${nameOf(from)} into ${nameOfRef(state, into)}`, commands: plan.commands, selectionHint: [into] } };
}
