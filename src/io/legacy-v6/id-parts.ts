/**
 * The readable part of a legacy-derived ORN ID (docs/MIGRATION.md §4.2) and the per-namespace collision resolution.
 *
 * A legacy ID is sanitised to `[0-9a-z-]` (ASCII letters lowercased, every other code point becomes `-`); when sanitising (or the
 * length cap below) changed the value, `-<hash>` of the ORIGINAL is appended. The hash is the deterministic core `hash64`
 * (src/core/hash.ts, step 2.2), cut to 6 hex characters; §4.2 names no other. Two different originals can still end up with the
 * same part (a hash collision, or an original that already looks like a produced one such as `c15-3f9a1b`): `resolveParts`
 * detects that and gives ALL colliding values a longer hash (12, then 16 hex characters, then 16 plus an ordinal), never merging
 * them, and reports every collision it saw.
 *
 * Length: an ORN ID body is at most 63 characters (`ID_BODY_SOURCE`). A part is capped at MAX_PART_LENGTH so every ID built
 * from up to two parts (`rel_v6-<a>-<b>`) plus a prefix stays inside that; a longer sanitised original is truncated and counts
 * as changed (so it carries the hash of the whole original).
 */
import { hash64 } from '@/core/hash';

export const MAX_PART_LENGTH = 27;
/** Longest slug (readable text prefix) of a part built from free text. */
export const MAX_SLUG_LENGTH = 40;
/** Hash lengths by tier: tier 0 = 6 hex characters, tier 1 = 12, tier 2 = 16; tier 3 = 16 plus an ordinal. */
const HASH_LENGTH = [6, 12, 16] as const;

export type IdTier = 0 | 1 | 2 | 3;

export const hashOf = (original: string, length: number): string => hash64(original).slice(0, length);

/** ASCII letters lowercased, digits and `-` kept, every other code point (not UTF-16 unit) replaced by `-`. */
export function sanitizeLegacyId(original: string): string {
  let out = '';
  for (const ch of original) {
    const code = ch.codePointAt(0) as number;
    if ((code >= 48 && code <= 57) || (code >= 97 && code <= 122) || code === 45) out += ch;
    else if (code >= 65 && code <= 90) out += String.fromCharCode(code + 32);
    else out += '-';
  }
  return out;
}

const withHash = (base: string, original: string, hashLength: number): string =>
  `${base.slice(0, MAX_PART_LENGTH - 1 - hashLength)}-${hashOf(original, hashLength)}`;

/** The part of a legacy record ID at a tier (tiers 0 to 2; tier 3 is assigned by `resolveParts`). */
export function legacyPart(original: string, tier: 0 | 1 | 2): string {
  const sanitized = sanitizeLegacyId(original);
  if (tier === 0 && sanitized === original && original.length > 0 && original.length <= MAX_PART_LENGTH) return original;
  return withHash(sanitized, original, HASH_LENGTH[tier]);
}

/** `[0-9a-z]` runs of the folded text joined by single `-`, at most MAX_SLUG_LENGTH characters, no leading or trailing `-`. */
export function slugOf(folded: string): string {
  const slug = folded
    .replace(/[^0-9a-z]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  return slug;
}

/** The part for text-derived IDs (`<slug>-<hash6>`), keyed by the folded text. Always hashed: the slug is only a reading aid. */
export function textPart(foldedKey: string, tier: 0 | 1 | 2): string {
  const hash = hashOf(foldedKey, HASH_LENGTH[tier]);
  const slug = slugOf(foldedKey);
  return slug === '' ? hash : `${slug}-${hash}`;
}

/** Called with a key and a tier from 0 to 2; returns the candidate part. Must be a pure function of its arguments. */
export type PartLadder = (key: string, tier: 0 | 1 | 2) => string;

export interface IdCollision {
  readonly namespace: string;
  /** The different originals (keys) that produced one part at some tier, sorted. */
  readonly originals: readonly string[];
  /** The part they shared (for a shared pass: the ID body, without the ID family). */
  readonly sharedPart: string;
  /** What each original finally got, in the order of `originals`. `space` is set only when the collision spans several namespaces. */
  readonly resolved: readonly { readonly original: string; readonly part: string; readonly space?: string }[];
}

export interface ResolvedParts {
  readonly parts: ReadonlyMap<string, string>;
  readonly collisions: readonly IdCollision[];
}

/**
 * Where a key's part lives in the ID space: `family` is the group of ID prefixes that share one range of IDs (`spc`, `cls`), `body`
 * the text after the prefix. Two keys collide only when they hold the same body in the same family.
 */
export interface IdSlot {
  readonly family: string;
  readonly body: string;
}

/** One namespace of keys that takes part in a shared pass. */
export interface PartSpace {
  readonly namespace: string;
  readonly keys: Iterable<string>;
  readonly ladder: PartLadder;
  /** The slots a part occupies. Default: one slot in the family named like the namespace, body = part. */
  readonly slots?: (part: string) => readonly IdSlot[];
}

export interface ResolvedSharedParts {
  /** Namespace → key → part. */
  readonly parts: ReadonlyMap<string, ReadonlyMap<string, string>>;
  readonly collisions: readonly IdCollision[];
}

const SEP = '\u0000';
const slotKey = (slot: IdSlot): string => `${slot.family}${SEP}${slot.body}`;

/**
 * Parts for a set of distinct keys of ONE namespace. Deterministic and independent of the order the keys arrive in. A key whose
 * part is shared with another key moves up a tier, together with everyone it collides with; this repeats until every part is
 * unique. Tier 3 (`<hash16>-<n>`, the smallest free `n`) is only reached by crafted input and always ends the search.
 */
export function resolveParts(namespace: string, keys: Iterable<string>, ladder: PartLadder): ResolvedParts {
  const result = resolveSharedParts([{ namespace, keys, ladder }]);
  return { parts: result.parts.get(namespace) as ReadonlyMap<string, string>, collisions: result.collisions };
}

interface Entry {
  readonly composite: string;
  readonly space: PartSpace;
  readonly key: string;
}

/**
 * Several namespaces settled in ONE pass (step 3.10 review, MIGRATION.md §4.2): namespaces whose IDs can read alike because they share
 * an ID family (a compound part and a functional-group part both end up as `cls_v6-<body>`) are collision-checked together, so a
 * crafted clash between them is settled by the ladder like any other. Namespaces that share no family never collide (a label and a
 * class text that fold alike share nothing). For one namespace this is exactly the per-namespace resolution.
 */
export function resolveSharedParts(spaces: readonly PartSpace[]): ResolvedSharedParts {
  const entries: Entry[] = [];
  for (const space of spaces) for (const key of new Set(space.keys)) entries.push({ composite: `${space.namespace}${SEP}${key}`, space, key });
  entries.sort((a, b) => (a.composite < b.composite ? -1 : a.composite > b.composite ? 1 : 0));
  const entryOf = new Map(entries.map((entry) => [entry.composite, entry] as const));

  const tierOf = new Map<string, IdTier>();
  const partOf = new Map<string, string>();
  const heldSlots = new Map<string, string[]>();
  const holders = new Map<string, string[]>();
  const slotsOf = (entry: Entry, part: string): string[] =>
    (entry.space.slots === undefined ? [{ family: entry.space.namespace, body: part }] : [...entry.space.slots(part)]).map(slotKey);
  const place = (entry: Entry, tier: IdTier, part: string): void => {
    tierOf.set(entry.composite, tier);
    partOf.set(entry.composite, part);
    const slots = slotsOf(entry, part);
    heldSlots.set(entry.composite, slots);
    for (const slot of slots) {
      const list = holders.get(slot);
      if (list === undefined) holders.set(slot, [entry.composite]);
      else list.push(entry.composite);
    }
  };
  const leave = (composite: string): void => {
    for (const slot of heldSlots.get(composite) ?? []) {
      const rest = (holders.get(slot) ?? []).filter((held) => held !== composite);
      if (rest.length === 0) holders.delete(slot);
      else holders.set(slot, rest);
    }
    heldSlots.delete(composite);
  };
  for (const entry of entries) place(entry, 0, entry.space.ladder(entry.key, 0));

  const events = new Map<string, { sharedPart: string; members: string[] }>();
  const queue = [...holders].filter(([, list]) => list.length > 1).map(([slot]) => slot);
  while (queue.length > 0) {
    const slot = queue.pop() as string;
    const members = holders.get(slot);
    if (members === undefined || members.length < 2) continue;
    const originals = [...members].sort();
    events.set(`${slot}${SEP}${originals.join(SEP)}`, { sharedPart: slot.slice(slot.indexOf(SEP) + 1), members: originals });
    // the members leave every slot they hold, then those that can move take their next candidate; a tier-3 member stays where it is
    for (const composite of originals) leave(composite);
    const stayed: Entry[] = [];
    let moved = false;
    for (const composite of originals) {
      const entry = entryOf.get(composite) as Entry;
      const tier = tierOf.get(composite) as IdTier;
      if (tier === 3) {
        stayed.push(entry);
        continue;
      }
      moved = true;
      if (tier < 2) {
        const next = (tier + 1) as 1 | 2;
        place(entry, next, entry.space.ladder(entry.key, next));
      } else {
        const base = hashOf(entry.key, 16);
        let n = 1;
        while (slotsOf(entry, `${base}-${n}`).some((candidate) => holders.has(candidate))) n += 1;
        place(entry, 3, `${base}-${n}`);
      }
    }
    for (const entry of stayed) place(entry, 3, partOf.get(entry.composite) as string);
    if (!moved) continue;
    for (const composite of originals) {
      for (const now of heldSlots.get(composite) ?? []) if ((holders.get(now)?.length ?? 0) > 1) queue.push(now);
    }
  }

  const collisions: IdCollision[] = [...events.values()].map((event) => {
    const members = event.members.map((composite) => entryOf.get(composite) as Entry);
    const namespaces = [...new Set(members.map((entry) => entry.space.namespace))].sort();
    const mixed = namespaces.length > 1;
    return {
      namespace: namespaces.join('+'),
      originals: members.map((entry) => entry.key),
      sharedPart: event.sharedPart,
      resolved: members.map((entry) => ({
        original: entry.key,
        part: partOf.get(entry.composite) as string,
        ...(mixed ? { space: entry.space.namespace } : {}),
      })),
    };
  });
  const parts = new Map<string, Map<string, string>>(spaces.map((space) => [space.namespace, new Map<string, string>()] as const));
  for (const entry of entries) parts.get(entry.space.namespace)?.set(entry.key, partOf.get(entry.composite) as string);
  return { parts, collisions };
}
