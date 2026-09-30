/**
 * Deterministic ORN IDs for a legacy document (docs/MIGRATION.md §4.2). `createLegacyIdSpace` takes every legacy value that will
 * need an ID (compound IDs, reaction IDs, free-text labels, concept / named-reaction / topic texts, related-reaction pairs) and
 * settles the readable part of each one up front, so a collision between two different values is found and resolved for the whole
 * document at once (`id-parts.ts`), and reported in `collisions` for the import report. Same input, same IDs, in any order.
 *
 * Asking for an ID of a value that was not registered is a programmer error and throws: it could not have been checked for
 * collisions. Text-derived IDs are keyed by the FOLDED text (`fold`, core), which is also how §4.2 deduplicates them. Matching
 * text against existing records (concepts, topics, labels) is not done here (steps 3.10 and 3.11).
 */
import { fold } from '@/core/text';
import { hashOf, legacyPart, resolveParts, resolveSharedParts, textPart, type IdCollision, type PartLadder } from './id-parts';

export interface LegacyIdSpaceInput {
  readonly compoundIds?: Iterable<string>;
  readonly reactionIds?: Iterable<string>;
  /** Participant labels (after the label parser took its tokens out) that will become a reagent or species. */
  readonly labels?: Iterable<string>;
  readonly concepts?: Iterable<string>;
  readonly namedReactions?: Iterable<string>;
  readonly topics?: Iterable<string>;
  /** Functional-group ids as they stand in v5 data (`fgId`, `functionalGroups[]`), exact text: each may become a `functional_group` class. */
  readonly functionalGroups?: Iterable<string>;
  /** `compoundClass` texts: each may become a class (matched by folded name first, else created). */
  readonly classTexts?: Iterable<string>;
  /** `relatedReactions` pairs of legacy reaction IDs; order and repeats do not matter, a reaction related to itself is ignored. */
  readonly relatedPairs?: Iterable<readonly [string, string]>;
}

export interface LegacyIdSpace {
  /** Every collision found while settling the parts (empty for an ordinary document). */
  readonly collisions: readonly IdCollision[];
  speciesId(compoundId: string): string;
  classId(compoundId: string): string;
  anchorId(compoundId: string): string;
  displayId(compoundId: string): string;
  reactionId(reactionId: string): string;
  participantId(reactionId: string, n: number): string;
  stageId(reactionId: string, n: number): string;
  outcomeId(reactionId: string, n?: number): string;
  productId(reactionId: string, n: number): string;
  /** `int_v6-<part>-<n>` (step 3.11a): an entry of `intermediates[]`, `n` = the 1-based position of the participant in the legacy list. */
  intermediateId(reactionId: string, n: number): string;
  caveatId(reactionId: string, n: number): string;
  relevanceId(reactionId: string, which: 'main' | 'advanced'): string;
  /** `rel_v6-<lower>-<higher>`: symmetric. `undefined` for a reaction related to itself (no relationship exists). */
  relatedReactionId(a: string, b: string): string | undefined;
  reagentFromLabelId(label: string): string;
  speciesFromLabelId(label: string): string;
  conceptId(text: string): string;
  namedReactionId(text: string): string;
  topicId(text: string): string;
  /** `cls_v6-fg-<part>`: the `functional_group` class of a functional-group id (exact text, as v6 stores it). */
  functionalGroupClassId(functionalGroup: string): string;
  /** `cls_v6-l-<slug>-<hash6>`: the class created from a `compoundClass` text (deduplicated by folded text). */
  classFromTextId(text: string): string;
}

/** Injective key of an unordered pair (a separator character could be part of a legacy ID). */
const pairKey = (a: string, b: string): string => JSON.stringify(a < b ? [a, b] : [b, a]);

const legacyLadder: PartLadder = (key, tier) => legacyPart(key, tier);
const textLadder: PartLadder = (key, tier) => textPart(key, tier);
const hashLength = [6, 12, 16] as const;

function requireCount(n: number, what: string): number {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`${what} must be an integer >= 1, got ${String(n)}`);
  return n;
}

/** Settles all parts of one legacy document. Never throws for any registered value, whatever its characters. */
export function createLegacyIdSpace(input: LegacyIdSpaceInput = {}): LegacyIdSpace {
  const collisions: IdCollision[] = [];
  const settle = (namespace: string, keys: Iterable<string>, ladder: PartLadder): ReadonlyMap<string, string> => {
    const resolved = resolveParts(namespace, keys, ladder);
    collisions.push(...resolved.collisions);
    return resolved.parts;
  };
  const folded = (texts: Iterable<string> | undefined): string[] => [...(texts ?? [])].map(fold);

  // The namespaces whose IDs can read alike are settled in ONE pass, per ID family (step 3.10 review): a compound part is the body of
  // both `spc_v6-` and `cls_v6-`, a label part of `spc_v6-l-`, a functional-group part of `cls_v6-fg-`, a class text of `cls_v6-l-`.
  // A crafted clash (a hub `fg-x` and the functional-group class of `x`) is therefore settled by the ladder, not refused. A label and a
  // class text that fold alike share no family, so they never collide.
  const shared = resolveSharedParts([
    { namespace: 'compound', keys: input.compoundIds ?? [], ladder: legacyLadder, slots: (part) => [{ family: 'spc', body: part }, { family: 'cls', body: part }] },
    { namespace: 'label', keys: folded(input.labels), ladder: textLadder, slots: (part) => [{ family: 'spc', body: `l-${part}` }] },
    { namespace: 'functional_group', keys: input.functionalGroups ?? [], ladder: legacyLadder, slots: (part) => [{ family: 'cls', body: `fg-${part}` }] },
    { namespace: 'class_text', keys: folded(input.classTexts), ladder: textLadder, slots: (part) => [{ family: 'cls', body: `l-${part}` }] },
  ]);
  collisions.push(...shared.collisions);
  const part = (namespace: string): ReadonlyMap<string, string> => shared.parts.get(namespace) as ReadonlyMap<string, string>;
  const compounds = part('compound');
  const labels = part('label');
  const functionalGroups = part('functional_group');
  const classTexts = part('class_text');
  const reactions = settle('reaction', input.reactionIds ?? [], legacyLadder);
  const concepts = settle('concept', folded(input.concepts), textLadder);
  const namedReactions = settle('named_reaction', folded(input.namedReactions), textLadder);
  const topics = settle('topic', folded(input.topics), textLadder);

  // A pair's natural part joins the two reaction parts; different pairs can join to the same text ("a-b"+"c" vs "a"+"b-c").
  // Every pair whose reactions are registered is settled here; a pair naming an unregistered reaction is a programmer error.
  const pairs = new Map<string, readonly [string, string]>();
  for (const [a, b] of input.relatedPairs ?? []) {
    if (a === b) continue;
    pairs.set(pairKey(a, b), a < b ? [a, b] : [b, a]);
  }
  const reactionPart = (id: string): string => {
    const part = reactions.get(id);
    if (part === undefined) throw new Error(`legacy reaction ID was not registered with createLegacyIdSpace: ${JSON.stringify(id)}`);
    return part;
  };
  const pairLadder: PartLadder = (key, tier) => {
    const pair = pairs.get(key) as readonly [string, string];
    return tier === 0 ? `${reactionPart(pair[0])}-${reactionPart(pair[1])}` : hashOf(key, hashLength[tier]);
  };
  const related = settle('relationship', pairs.keys(), pairLadder);

  const lookup = (table: ReadonlyMap<string, string>, key: string, what: string): string => {
    const part = table.get(key);
    if (part === undefined) throw new Error(`${what} was not registered with createLegacyIdSpace: ${JSON.stringify(key)}`);
    return part;
  };
  const compound = (id: string): string => lookup(compounds, id, 'legacy compound ID');
  const text = (table: ReadonlyMap<string, string>, value: string, what: string): string => lookup(table, fold(value), what);

  return {
    collisions,
    speciesId: (id) => `spc_v6-${compound(id)}`,
    classId: (id) => `cls_v6-${compound(id)}`,
    anchorId: (id) => `anc_v6-${compound(id)}`,
    displayId: (id) => `edp_v6-${compound(id)}`,
    reactionId: (id) => `rxn_v6-${reactionPart(id)}`,
    participantId: (id, n) => `prt_v6-${reactionPart(id)}-${requireCount(n, 'participant number')}`,
    stageId: (id, n) => `stg_v6-${reactionPart(id)}-${requireCount(n, 'stage number')}`,
    outcomeId: (id, n = 1) => `out_v6-${reactionPart(id)}-${requireCount(n, 'outcome number')}`,
    productId: (id, n) => `pdt_v6-${reactionPart(id)}-${requireCount(n, 'product number')}`,
    intermediateId: (id, n) => `int_v6-${reactionPart(id)}-${requireCount(n, 'intermediate number')}`,
    caveatId: (id, n) => `cav_v6-${reactionPart(id)}-${requireCount(n, 'caveat number')}`,
    relevanceId: (id, which) => `erl_v6-${reactionPart(id)}-${which}`,
    relatedReactionId(a, b) {
      if (a === b) return undefined;
      return `rel_v6-${lookup(related, pairKey(a, b), 'related reaction pair')}`;
    },
    reagentFromLabelId: (label) => `rgt_v6-l-${text(labels, label, 'label')}`,
    speciesFromLabelId: (label) => `spc_v6-l-${text(labels, label, 'label')}`,
    conceptId: (value) => `cpt_v6-${text(concepts, value, 'concept text')}`,
    namedReactionId: (value) => `nrx_v6-${text(namedReactions, value, 'named reaction text')}`,
    topicId: (value) => `top_v6-${text(topics, value, 'topic text')}`,
    functionalGroupClassId: (value) => `cls_v6-fg-${lookup(functionalGroups, value, 'functional-group id')}`,
    classFromTextId: (value) => `cls_v6-l-${text(classTexts, value, 'compoundClass text')}`,
  };
}

/** `ast_v6-<first 16 hex of sha256>` for a legacy image; `sha256` is the lowercase hex digest of the decoded bytes. */
export function legacyAssetId(sha256: string): string {
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new TypeError('legacyAssetId expects a lowercase hex SHA-256 digest (64 characters)');
  return `ast_v6-${sha256.slice(0, 16)}`;
}
