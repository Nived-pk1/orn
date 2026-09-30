/**
 * The CHEM-008 requests of a mechanism (main side, pure): one per step that has bond changes or curved arrows, with the
 * structures of the step's species and every atom-map number the step uses, each with its path. A step that uses maps but has no
 * structure at all cannot be compared and is listed as "not compared".
 */
import type { Mechanism } from '@/core/schema';
import type { MapUse, NotCompared, StepCheckRequest } from './contracts';

export interface MechanismPlan {
  readonly requests: readonly StepCheckRequest[];
  readonly notCompared: readonly NotCompared[];
}

type ElectronSite = Mechanism['variants'][number]['steps'][number]['electronMovements'][number]['from'];
const sitesOf = (site: ElectronSite): readonly number[] => (site.kind === 'bond' ? site.atoms : [site.atom]);

export function mechanismPlan(mechanism: Mechanism): MechanismPlan {
  const requests: StepCheckRequest[] = [];
  const notCompared: NotCompared[] = [];
  for (const [i, variant] of mechanism.variants.entries()) {
    for (const [j, step] of variant.steps.entries()) {
      const path = `variants[${i}].steps[${j}]`;
      const uses: MapUse[] = [
        ...step.bondsFormed.map((bond, k) => ({ path: `${path}.bondsFormed[${k}]`, maps: [...bond.atoms] })),
        ...step.bondsBroken.map((bond, k) => ({ path: `${path}.bondsBroken[${k}]`, maps: [...bond.atoms] })),
        ...step.electronMovements.map((move, k) => ({ path: `${path}.electronMovements[${k}]`, maps: [...sitesOf(move.from), ...sitesOf(move.to)] })),
      ];
      if (uses.length === 0) continue;
      const structures = step.species.flatMap((species) => (species.structure === undefined ? [] : [species.structure]));
      if (structures.length === 0) {
        notCompared.push({ ruleId: 'CHEM-008', reason: `${path} was not compared: the step uses atom maps but none of its species has a structure` });
        continue;
      }
      requests.push({ path, structures, uses });
    }
  }
  return { requests, notCompared };
}
