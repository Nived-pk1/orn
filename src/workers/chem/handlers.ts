/**
 * The chem worker's RPC handlers: thin wrappers over a `StructureToolkit` (step 4.3a). The worker holds no state but the
 * toolkit's own cache (ADR-034 D1). Params arrive over the wire, so their SHAPE is checked here (`BAD_REQUEST`); their
 * content (size caps, a structure RDKit cannot read) is the toolkit's business and answers a value. Depict answers sanitised
 * SVG or a failure value: nothing else leaves this worker as markup.
 */
import { depictionDetails, type DepictionOptions, type StructureToolkit } from '@/chem';
import { STRUCTURE_FORMATS, type StructureRep } from '@/core/schema';
import type { ChemWorkerApi } from '@/workers/rpc/contracts';
import { RpcHostError } from '@/workers/rpc/helpers';

function structureOf(value: unknown): StructureRep {
  const candidate = value as { format?: unknown; value?: unknown } | null;
  if (typeof candidate !== 'object' || candidate === null || typeof candidate.value !== 'string' || !STRUCTURE_FORMATS.some((format) => format === candidate.format)) {
    throw new RpcHostError('BAD_REQUEST', `structure must be { format: ${STRUCTURE_FORMATS.join(' | ')}, value: string }`);
  }
  return candidate as StructureRep;
}

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
  return {
    parse: async ({ structure }) => toolkit.parse(structureOf(structure)),
    depict: async ({ structure, options }) => toolkit.depict(structureOf(structure), optionsOf(options)),
  };
}
