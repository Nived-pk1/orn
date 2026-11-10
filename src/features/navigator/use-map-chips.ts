import { useEffect, useMemo, useState } from "react";
import type { withChips as WithChipsFn } from "./map-chips";
import type { createPairFacts as CreatePairFactsFn } from "./pair-facts";
import type { NavigatorPorts } from "./contracts";

type WithChips = typeof WithChipsFn;
type CreatePairFacts = typeof CreatePairFactsFn;

/** The reagent words on arrow chips come from their own chunk, loaded right after the first paint (the first view draws no arrow). Moved from navigator-canvas.tsx (step 8.4e). */
export function useMapChips(ports: NavigatorPorts): {
  readonly facts: ReturnType<CreatePairFacts> | undefined;
  readonly chips: WithChips | undefined;
} {
  const [factsMaker, setFactsMaker] = useState<CreatePairFacts | null>(null);
  const [chips, setChips] = useState<WithChips | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void Promise.all([import("./pair-facts"), import("./map-chips")]).then(
      ([facts, chipModule]) => {
        if (!live) return;
        setFactsMaker(() => facts.createPairFacts);
        setChips(() => chipModule.withChips);
      },
    );
    return () => {
      live = false;
    };
  }, []);
  const facts = useMemo(
    () => (factsMaker === null ? undefined : factsMaker(ports)),
    [factsMaker, ports],
  );
  return { facts, chips };
}
