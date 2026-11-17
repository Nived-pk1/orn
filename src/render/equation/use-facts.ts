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

/** What each port has answered (bounded): a term made again (the hero swaps its layout) is ready at once instead of saying "Drawing the structure" again (step 8.4m2, B3). */
const MAX_ANSWERS = 500;
const answered = new WeakMap<StructureFactsPort, Map<string, FactsInput>>();
function remember(port: StructureFactsPort, key: string, facts: FactsInput): void {
  let known = answered.get(port);
  if (known === undefined) answered.set(port, (known = new Map()));
  known.delete(key);
  known.set(key, facts);
  if (known.size > MAX_ANSWERS) known.delete(known.keys().next().value as string);
}

export function useFactsInput(port: StructureFactsPort | undefined, structure: StructureRep | undefined, needed: boolean): FactsInput {
  const [answer, setAnswer] = useState<{ readonly key: string; readonly facts: FactsInput } | undefined>(undefined);
  const key = structure === undefined ? undefined : keyOf(structure);
  useEffect(() => {
    if (!needed || structure === undefined || key === undefined || port === undefined || answered.get(port)?.has(key) === true) return;
    let live = true;
    port.factsOf(structure).then(
      (result) => {
        const facts: FactsInput = result.ok ? { state: 'ready', ...(result.heavyAtomCount === undefined ? {} : { heavyAtomCount: result.heavyAtomCount }), ...(result.carbonCount === undefined ? {} : { carbonCount: result.carbonCount }), ...(result.formula === undefined ? {} : { formula: result.formula }), ...(result.charge === undefined ? {} : { charge: result.charge }) } : { state: 'unavailable' };
        remember(port, key, facts);
        if (live) setAnswer({ key, facts });
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
  if (answer !== undefined && answer.key === key) return answer.facts;
  return (key === undefined ? undefined : answered.get(port)?.get(key)) ?? { state: 'pending' };
}
