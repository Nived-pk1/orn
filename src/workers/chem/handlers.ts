/**
 * The chem worker's RPC handlers: thin wrappers over a `StructureToolkit` (step 4.3a). The worker holds no state but the
 * toolkit's own cache (ADR-034 D1). Params arrive over the wire, so their SHAPE is checked here (`BAD_REQUEST`); their
 * content (size caps, a structure RDKit cannot read) is the toolkit's business and answers a value. Depict answers sanitised
 * SVG or a failure value: nothing else leaves this worker as markup.
 */
import { depictionDetails, type DepictionOptions, type StructureToolkit } from '@/chem';
import { createChemChecks } from '@/chem/checks';
import type { ChemWorkerApi } from '@/workers/rpc/contracts';
import { RpcHostError } from '@/workers/rpc/helpers';
import { balanceRequestsOf, probesOf, speciesRequestsOf, stepRequestsOf, structureOf } from './wire';

function optionsOf(value: unknown): DepictionOptions {
  if (typeof value !== 'object' || value === null) throw new RpcHostError('BAD_REQUEST', 'options must be an object');
  try {
    depictionDetails(value as DepictionOptions);
  } catch (error) {
    throw new RpcHostError('BAD_REQUEST', error instanceof Error ? error.message : 'bad depiction options');
  }
  return value as DepictionOptions;
}

export function createChemHandlers(toolkit: StructureToolkit): ChemWorkerApi {
  const checks = createChemChecks(toolkit);
  return {
    parse: async ({ structure }) => toolkit.parse(structureOf(structure)),
    depict: async ({ structure, options }) => toolkit.depict(structureOf(structure), optionsOf(options)),
    checkSpecies: async ({ species }) => checks.checkSpecies(speciesRequestsOf(species)),
    checkReaction: async ({ outcomes }) => checks.checkReaction(balanceRequestsOf(outcomes)),
    checkMechanism: async ({ steps }) => checks.checkMechanism(stepRequestsOf(steps)),
    matches: async ({ probes }) => checks.matches(probesOf(probes)),
  };
}
