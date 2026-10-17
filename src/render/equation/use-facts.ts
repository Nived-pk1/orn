/**
 * The chem facts one term needs, as a React value: `pending` until the engine answers, `unavailable` when it cannot (or there is no port),
 * else the counts. Asked only when `needed` (a species with both a structure and an entered formula); a term that needs none is `ready`
 * at once with no counts and never asks.
 */
import { useEffect, useState } from 'react';
import type { FactsInput } from '@/core/graph';
import type { StructureRep } from '@/core/schema';
import type { StructureFactsPort } from './contracts';

const keyOf = (structure: StructureRep): string => `${structure.format}\u0000${structure.value}`;

export function useFactsInput(port: StructureFactsPort | undefined, structure: StructureRep | undefined, needed: boolean): FactsInput {
  const [answer, setAnswer] = useState<{ readonly key: string; readonly facts: FactsInput } | undefined>(undefined);
  const key = structure === undefined ? undefined : keyOf(structure);
  useEffect(() => {
    if (!needed || structure === undefined || key === undefined || port === undefined) return;
    let live = true;
    port.factsOf(structure).then(
      (result) => {
        if (live) setAnswer({ key, facts: result.ok ? { state: 'ready', ...(result.heavyAtomCount === undefined ? {} : { heavyAtomCount: result.heavyAtomCount }), ...(result.carbonCount === undefined ? {} : { carbonCount: result.carbonCount }) } : { state: 'unavailable' } });
      },
      () => {
        if (live) setAnswer({ key, facts: { state: 'unavailable' } });
      },
    );
    return () => {
      live = false;
    };
    // `structure` is identified by its key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port, key, needed]);
  if (!needed) return { state: 'ready' };
  if (port === undefined) return { state: 'unavailable' };
  return answer !== undefined && answer.key === key ? answer.facts : { state: 'pending' };
}
