/**
 * The facts and depiction cache of the chem worker (ADR-009, IMPLEMENTATION_PLAN 4.3a): two LRU caches of 500 entries, keyed by
 * hash(kind, format, value, options, toolkit, toolkit version). A hit also compares the whole input the entry was made from, so
 * two inputs whose 64-bit hashes collide can never answer for each other. Derived data only: it is never stored, and a worker
 * restart drops it. Only answers that hold for the same input are kept (a result, `invalid`, `refused`); `unavailable` and
 * `timeout` say nothing about the structure and are never cached. `matchesSmarts` is not cached.
 */
import { hashParts } from '@/core/hash';
import type { StructureRep } from '@/core/schema';
import type { DepictionOptions, DepictOutcome, ParseOutcome, StructureToolkit } from './contracts';
import { LruCache } from './lru';

export const CHEM_CACHE_SIZE = 500;

interface Entry<T> {
  readonly input: string;
  readonly outcome: T;
}

export interface ChemCacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly facts: number;
  readonly depictions: number;
}

export interface CachedToolkit extends StructureToolkit {
  stats(): ChemCacheStats;
}

const cacheable = (outcome: ParseOutcome | DepictOutcome): boolean => outcome.ok || outcome.reason === 'invalid' || outcome.reason === 'refused';

export function withChemCache(inner: StructureToolkit, capacity: number = CHEM_CACHE_SIZE): CachedToolkit {
  const facts = new LruCache<Entry<ParseOutcome>>(capacity);
  const depictions = new LruCache<Entry<DepictOutcome>>(capacity);
  let hits = 0;
  let misses = 0;

  /** `undefined` when the toolkit is not loaded: nothing to key on, and the answer will be `unavailable` anyway. */
  async function keyed(parts: readonly string[]): Promise<{ readonly key: string; readonly input: string } | undefined> {
    await inner.ready();
    if (inner.version === 'not loaded') return undefined;
    const input = JSON.stringify([...parts, inner.name, inner.version]);
    return { key: hashParts([...parts, inner.name, inner.version]), input };
  }

  return {
    name: inner.name,
    get version(): string {
      return inner.version;
    },
    ready: () => inner.ready(),

    async parse(structure: StructureRep): Promise<ParseOutcome> {
      const at = await keyed(['parse', structure.format, structure.value]);
      const found = at === undefined ? undefined : facts.get(at.key);
      if (at !== undefined && found?.input === at.input) {
        hits += 1;
        return found.outcome;
      }
      misses += 1;
      const outcome = await inner.parse(structure);
      if (at !== undefined && cacheable(outcome)) facts.set(at.key, { input: at.input, outcome });
      return outcome;
    },

    async depict(structure: StructureRep, options: DepictionOptions): Promise<DepictOutcome> {
      const maps = [...new Set(options.highlightAtomMaps ?? [])].sort((a, b) => a - b);
      const at = await keyed(['depict', structure.format, structure.value, JSON.stringify([options.width, options.height, options.showAtomMaps, maps, options.mode ?? 'skeletal'])]);
      const found = at === undefined ? undefined : depictions.get(at.key);
      if (at !== undefined && found?.input === at.input) {
        hits += 1;
        return found.outcome;
      }
      misses += 1;
      const outcome = await inner.depict(structure, options);
      if (at !== undefined && cacheable(outcome)) depictions.set(at.key, { input: at.input, outcome });
      return outcome;
    },

    matchesSmarts: (structure, smarts) => inner.matchesSmarts(structure, smarts),
    stats: () => ({ hits, misses, facts: facts.size, depictions: depictions.size }),
  };
}
