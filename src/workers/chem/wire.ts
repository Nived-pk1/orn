/**
 * The SHAPE of the L4 check requests, checked where they arrive over the wire (`BAD_REQUEST`, ADR-034). Content (a structure
 * RDKit cannot read, a formula nobody can parse) is the checks' business and answers a value; only a malformed request is refused.
 * Sizes are bounded: at most `MAX_CHECK_BATCH` items per call, and per-item lists have caps.
 */
import { MAX_CHECK_BATCH } from '@/chem/checks/contracts';
import type { BalanceRequest, BalanceSide, MapUse, MatchProbe, SpeciesCheckRequest, StepCheckRequest } from '@/chem/checks/contracts';
import { LIMITS, STRUCTURE_FORMATS, type StructureRep } from '@/core/schema';
import { RpcHostError } from '@/workers/rpc/helpers';

const MAX_SIDES = 64;
const MAX_USES = 512;
const MAX_MAPS_PER_USE = 8;
const MAX_TEXT = 1_000;

const bad = (message: string): never => {
  throw new RpcHostError('BAD_REQUEST', message);
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function list(value: unknown, what: string, max: number): readonly unknown[] {
  if (!Array.isArray(value)) return bad(`${what} must be an array`);
  if (value.length > max) return bad(`${what} has ${value.length} items; the limit is ${max}`);
  return value;
}

function text(value: unknown, what: string, max = MAX_TEXT): string {
  if (typeof value !== 'string' || value.length > max) return bad(`${what} must be a string of at most ${max} characters`);
  return value;
}

export function structureOf(value: unknown): StructureRep {
  if (!isObject(value) || typeof value.value !== 'string' || !STRUCTURE_FORMATS.some((format) => format === value.format)) {
    return bad(`structure must be { format: ${STRUCTURE_FORMATS.join(' | ')}, value: string }`);
  }
  return value as unknown as StructureRep;
}

function itemOf(value: unknown, what: string): Record<string, unknown> {
  return isObject(value) ? value : bad(`${what} must be an object`);
}

export function speciesRequestsOf(value: unknown): readonly SpeciesCheckRequest[] {
  return list(value, 'species', MAX_CHECK_BATCH).map((raw, i) => {
    const item = itemOf(raw, `species[${i}]`);
    if (item.formula !== undefined) text(item.formula, `species[${i}].formula`);
    if (item.charge !== undefined && !Number.isInteger(item.charge)) bad(`species[${i}].charge must be an integer`);
    return { id: text(item.id, `species[${i}].id`, 200), structure: structureOf(item.structure), ...(item.formula === undefined ? {} : { formula: item.formula as string }), ...(item.charge === undefined ? {} : { charge: item.charge as number }) };
  });
}

function sideOf(raw: unknown, what: string): BalanceSide {
  const item = itemOf(raw, what);
  if (typeof item.coefficient !== 'number' || !Number.isFinite(item.coefficient) || item.coefficient <= 0) bad(`${what}.coefficient must be a positive number`);
  return { label: text(item.label, `${what}.label`, 200), structure: structureOf(item.structure), coefficient: item.coefficient as number };
}

export function balanceRequestsOf(value: unknown): readonly BalanceRequest[] {
  return list(value, 'outcomes', MAX_CHECK_BATCH).map((raw, i) => {
    const item = itemOf(raw, `outcomes[${i}]`);
    return {
      path: text(item.path, `outcomes[${i}].path`, 200),
      reactants: list(item.reactants, `outcomes[${i}].reactants`, MAX_SIDES).map((side, k) => sideOf(side, `outcomes[${i}].reactants[${k}]`)),
      products: list(item.products, `outcomes[${i}].products`, MAX_SIDES).map((side, k) => sideOf(side, `outcomes[${i}].products[${k}]`)),
    };
  });
}

function useOf(raw: unknown, what: string): MapUse {
  const item = itemOf(raw, what);
  const maps = list(item.maps, `${what}.maps`, MAX_MAPS_PER_USE).map((map) => (Number.isInteger(map) ? (map as number) : bad(`${what}.maps must be integers`)));
  return { path: text(item.path, `${what}.path`, 200), maps };
}

export function stepRequestsOf(value: unknown): readonly StepCheckRequest[] {
  return list(value, 'steps', MAX_CHECK_BATCH).map((raw, i) => {
    const item = itemOf(raw, `steps[${i}]`);
    return {
      path: text(item.path, `steps[${i}].path`, 200),
      structures: list(item.structures, `steps[${i}].structures`, LIMITS.stepSpecies).map(structureOf),
      uses: list(item.uses, `steps[${i}].uses`, MAX_USES).map((use, k) => useOf(use, `steps[${i}].uses[${k}]`)),
    };
  });
}

export function probesOf(value: unknown): readonly MatchProbe[] {
  return list(value, 'probes', MAX_CHECK_BATCH).map((raw, i) => {
    const item = itemOf(raw, `probes[${i}]`);
    return { structure: structureOf(item.structure), smarts: text(item.smarts, `probes[${i}].smarts`, LIMITS.inlineStructure) };
  });
}
