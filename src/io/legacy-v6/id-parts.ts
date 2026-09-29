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
  /** The part they shared. */
  readonly sharedPart: string;
  /** What each original finally got, in the order of `originals`. */
  readonly resolved: readonly { readonly original: string; readonly part: string }[];
}

export interface ResolvedParts {
  readonly parts: ReadonlyMap<string, string>;
  readonly collisions: readonly IdCollision[];
}

/**
 * Parts for a set of distinct keys of ONE namespace. Deterministic and independent of the order the keys arrive in. A key whose
 * part is shared with another key moves up a tier, together with everyone it collides with; this repeats until every part is
 * unique. Tier 3 (`<hash16>-<n>`, the smallest free `n`) is only reached by crafted input and always ends the search.
 */
export function resolveParts(namespace: string, keys: Iterable<string>, ladder: PartLadder): ResolvedParts {
  const sorted = [...new Set(keys)].sort();
  const tierOf = new Map<string, IdTier>();
  const partOf = new Map<string, string>();
  const holders = new Map<string, string[]>();
  const place = (key: string, tier: IdTier, part: string): void => {
    tierOf.set(key, tier);
    partOf.set(key, part);
    const list = holders.get(part);
    if (list === undefined) holders.set(part, [key]);
    else list.push(key);
  };
  for (const key of sorted) place(key, 0, ladder(key, 0));

  const events = new Map<string, { sharedPart: string; originals: string[] }>();
  const queue = [...holders].filter(([, list]) => list.length > 1).map(([part]) => part);
  while (queue.length > 0) {
    const part = queue.pop() as string;
    const members = holders.get(part);
    if (members === undefined || members.length < 2) continue;
    const originals = [...members].sort();
    events.set(`${part}\u0000${originals.join('\u0000')}`, { sharedPart: part, originals });
    holders.delete(part);
    const stayed: string[] = [];
    let moved = false;
    for (const key of originals) {
      const tier = tierOf.get(key) as IdTier;
      if (tier === 3) {
        stayed.push(key);
        continue;
      }
      moved = true;
      if (tier < 2) {
        const next = (tier + 1) as 1 | 2;
        place(key, next, ladder(key, next));
      } else {
        let n = 1;
        while (holders.has(`${hashOf(key, 16)}-${n}`)) n += 1;
        place(key, 3, `${hashOf(key, 16)}-${n}`);
      }
    }
    if (stayed.length > 0) holders.set(part, stayed);
    if (!moved) continue;
    for (const key of originals) {
      const now = partOf.get(key) as string;
      if ((holders.get(now)?.length ?? 0) > 1) queue.push(now);
    }
  }

  const collisions = [...events.values()].map((event) => ({
    namespace,
    sharedPart: event.sharedPart,
    originals: event.originals,
    resolved: event.originals.map((original) => ({ original, part: partOf.get(original) as string })),
  }));
  return { parts: partOf, collisions };
}
