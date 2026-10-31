/**
 * A species or a class as a textbook box outside a family page (step 7.3b D3): its drawing (or its generic formula) with its name under it.
 * The Chapters view asks the app for this and the app hands it in (features never import each other). It builds the same `FamilyEnv` the
 * card host builds and draws the same `Structure`. No chemistry here.
 */
import { useEffect, useMemo, useState } from 'react';
import type { RecordRef } from '@/core/schema';
import { useStructureMode } from '@/render/svg';
import { useLayoutMode } from '@/ui/hooks';
import { depictionBindingOf } from './depictions';
import { FamilyEnvContext, type FamilyEnv } from './family-env';
import { Structure } from './family-structure';
import { useNavigator } from './navigator-context';
import { touchOf } from './reads';
import { createScenePorts } from './scene-ports';

export function SubstanceHost(props: { readonly substance: RecordRef }) {
  const { ports } = useNavigator();
  const layout = useLayoutMode();
  const structureMode = useStructureMode(ports.depictions);
  const [version, setVersion] = useState(0);
  useEffect(() => ports.store.subscribe((changes) => touchOf(changes) !== 'none' && setVersion((v) => v + 1)), [ports]);
  const binding = depictionBindingOf(ports);
  const env = useMemo<FamilyEnv>(() => {
    const scene = createScenePorts(ports.store.getState(), binding?.keyOf);
    return { describe: scene.describe, keyOf: scene.depictionKeyOf, manager: binding?.manager, timers: ports.timers, layout };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `structureMode` is read through the binding; it only has to make a new env; `version` re-makes it when the data moved
  }, [ports, binding, layout, structureMode, version]);
  return (
    <FamilyEnvContext.Provider value={env}>
      <Structure substance={props.substance} />
    </FamilyEnvContext.Provider>
  );
}
