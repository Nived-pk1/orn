/**
 * The study of the open family as React sees it (step 5.5b): computed once when the page opens and again only when a ChangeSet touches
 * a kind the page reads (`touchOf`: the projection's kinds and `reaction_scheme`). The work runs after a timer tick, so the page paints
 * its skeleton first (a family of thousands of reactions takes a moment). While it recomputes the previous value stays on screen.
 * `undefined`: not computed yet; `null`: the ID names no family in this dataset.
 */
import { useEffect, useState } from 'react';
import { familyStudy, type FamilyStudy } from '@/core/graph';
import type { NavigatorPorts } from './contracts';
import { touchOf } from './reads';

export function useFamilyStudy(ports: NavigatorPorts, hubId: string): FamilyStudy | null | undefined {
  const [version, setVersion] = useState(0);
  const [value, setValue] = useState<{ readonly hubId: string; readonly study: FamilyStudy | null } | undefined>(undefined);
  useEffect(() => ports.store.subscribe((changes) => touchOf(changes) !== 'none' && setVersion((v) => v + 1)), [ports]);
  useEffect(
    () =>
      ports.timers.after(0, () => {
        const study = familyStudy({ state: ports.store.getState(), indexes: ports.indexes.current(), scopeOf: () => 'unmapped' }, hubId);
        setValue({ hubId, study });
      }),
    [ports, hubId, version],
  );
  return value === undefined || value.hubId !== hubId ? undefined : value.study;
}
