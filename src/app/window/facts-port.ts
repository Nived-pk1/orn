/**
 * The facts port of the textbook equation (equation step, part 5): what the chem worker says about a structure, as far as the
 * formula-or-drawing rule uses it (the heavy-atom count and the carbon count). Answers are kept in a bounded memory cache (the worker has its
 * own cache too, but each ask crosses to it); two asks in flight for one structure share one call. An engine that cannot answer, or a
 * structure it rejects, is `ok: false` and is NOT kept, so the next ask tries again. Nothing here throws.
 */
import { LruCache } from '@/chem/lru';
import type { ChemService } from '@/workers/chem';
import type { StructureFactsAnswer, StructureFactsPort } from '@/render/equation';
import type { StructureRep } from '@/core/schema';

export const FACTS_CACHE_SIZE = 256;

export function createFactsPort(chem: Pick<ChemService, 'parse'>): StructureFactsPort {
  const kept = new LruCache<StructureFactsAnswer>(FACTS_CACHE_SIZE);
  const flying = new Map<string, Promise<StructureFactsAnswer>>();
  return {
    factsOf(structure: StructureRep): Promise<StructureFactsAnswer> {
      const key = `${structure.format}\u0000${structure.value}`;
      const hit = kept.get(key);
      if (hit !== undefined) return Promise.resolve(hit);
      const shared = flying.get(key);
      if (shared !== undefined) return shared;
      const asked = chem.parse(structure).then(
        (outcome): StructureFactsAnswer => {
          if (!outcome.ok) return { ok: false };
          const { heavyAtomCount, carbonCount } = outcome.facts;
          const answer: StructureFactsAnswer = { ok: true, ...(heavyAtomCount === undefined ? {} : { heavyAtomCount }), ...(carbonCount === undefined ? {} : { carbonCount }) };
          kept.set(key, answer);
          return answer;
        },
        (): StructureFactsAnswer => ({ ok: false }),
      );
      flying.set(key, asked);
      void asked.finally(() => flying.delete(key));
      return asked;
    },
  };
}
