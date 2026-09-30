/**
 * The checks the chem worker runs, over a `StructureToolkit` (which is behind the worker's cache). Stateless: each call carries
 * everything it needs and answers plain data. Items are processed one after another (RDKit is synchronous); a toolkit that traps
 * on one item answers `unavailable` for it and the next item goes on with a fresh module (adapter, ADR-034).
 */
import type { StructureToolkit } from '../contracts';
import { checkOneBalance } from './balance';
import type {
  BalanceAnswer,
  BalanceRequest,
  MatchesAnswer,
  MatchProbe,
  SpeciesCheckRequest,
  SpeciesChecksAnswer,
  StepCheckRequest,
  StepChecksAnswer,
  ToolkitIdentity,
} from './contracts';
import { checkOneStep } from './mechanism';
import { checkOneSpecies } from './species';

export interface ChemChecks {
  checkSpecies(requests: readonly SpeciesCheckRequest[]): Promise<SpeciesChecksAnswer>;
  checkReaction(requests: readonly BalanceRequest[]): Promise<BalanceAnswer>;
  checkMechanism(requests: readonly StepCheckRequest[]): Promise<StepChecksAnswer>;
  matches(probes: readonly MatchProbe[]): Promise<MatchesAnswer>;
}

/** The toolkit as loaded NOW (after `ready()`): a version of `not loaded` means the load failed. */
async function identity(toolkit: StructureToolkit): Promise<ToolkitIdentity> {
  await toolkit.ready();
  return { name: toolkit.name, version: toolkit.version };
}

export function createChemChecks(toolkit: StructureToolkit): ChemChecks {
  return {
    async checkSpecies(requests) {
      const toolkitId = await identity(toolkit);
      const results = [];
      for (const request of requests) results.push(await checkOneSpecies(toolkit, request));
      return { toolkit: toolkitId, results };
    },
    async checkReaction(requests) {
      const toolkitId = await identity(toolkit);
      const results = [];
      for (const request of requests) results.push(await checkOneBalance(toolkit, request));
      return { toolkit: toolkitId, results };
    },
    async checkMechanism(requests) {
      const toolkitId = await identity(toolkit);
      const results = [];
      for (const request of requests) results.push(await checkOneStep(toolkit, request));
      return { toolkit: toolkitId, results };
    },
    async matches(probes) {
      const toolkitId = await identity(toolkit);
      const outcomes = [];
      for (const probe of probes) outcomes.push(await toolkit.matchesSmarts(probe.structure, probe.smarts));
      return { toolkit: toolkitId, outcomes };
    },
  };
}
