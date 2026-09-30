/**
 * The L4 service over REAL RDKit, in process (step 4.3b): the chem worker's checks called directly, every request and every answer
 * passed through `structuredClone` as a port would. Test and bench only; the worker thread and the wire have their own tests.
 */
import { createChemChecks, createRdkitToolkit, loadRdkit, withChemCache, type ChemChecks, type RdkitModule } from '@/chem';
import type { CanonicalState } from '@/core/schema';
import { createFindingStore } from '@/core/validation/store';
import type { FindingStore } from '@/core/validation/contracts';
import { createL4Service, type L4Ports, type L4Service } from '@/workers/chem';

let shared: Promise<RdkitModule> | undefined;
/** One RDKit load per process (per test file). */
export const sharedRdkit = (): Promise<RdkitModule> => (shared ??= loadRdkit());

export async function realChecks(): Promise<ChemChecks> {
  const module = await sharedRdkit();
  return createChemChecks(withChemCache(createRdkitToolkit({ load: async () => module })));
}

const cloned = <T>(value: T): T => structuredClone(value);

export function realChemPort(checks: ChemChecks): L4Ports['chem'] {
  const wrap = async <T>(run: () => Promise<T>) => ({ ok: true as const, value: cloned(await run()) });
  return {
    checkSpecies: (species) => wrap(() => checks.checkSpecies(cloned(species))),
    checkReaction: (outcomes) => wrap(() => checks.checkReaction(cloned(outcomes))),
    checkMechanism: (steps) => wrap(() => checks.checkMechanism(cloned(steps))),
    matches: (probes) => wrap(() => checks.matches(cloned(probes))),
  };
}

export interface RealRig {
  readonly service: L4Service;
  readonly findings: FindingStore;
  readonly state: { current: CanonicalState };
}

/** A service over `initial` with a finding store of its own and immediate scheduling (the tests call `flush`). */
export async function realRig(initial: CanonicalState, findings: FindingStore = createFindingStore()): Promise<RealRig> {
  const state = { current: initial };
  const ports: L4Ports = { state: () => state.current, findings, chem: realChemPort(await realChecks()), schedule: () => undefined };
  return { service: createL4Service(ports), findings, state };
}
