/**
 * The main thread's side of the chem worker: `ParseOutcome` and `DepictOutcome` from an `RpcClient<ChemWorkerApi>`. A call the
 * worker could not answer is a value with a reason (Phase 4 contract decisions Q7): `timeout` when the per-call limit ended it
 * (the worker was terminated and restarted; it is NOT retried, D4), `unavailable` for everything else (down, crashed, busy,
 * refused). Neither says anything about the structure, so the L4 checks show "check unavailable", never CHEM-001. A crash under
 * the call is retried once (every call is idempotent). The batch checks (step 4.3b) answer a `CheckCall`: the worker's answer, or
 * the same two reasons. No chemistry here.
 */
import type { BalanceAnswer, BalanceRequest, MatchesAnswer, MatchProbe, SpeciesCheckRequest, SpeciesChecksAnswer, StepCheckRequest, StepChecksAnswer } from '@/chem/checks/contracts';
import type { DepictionOptions, DepictOutcome, ParseOutcome } from '@/chem/contracts';
import type { StructureRep } from '@/core/schema';
import { callWithRetry } from '@/workers/rpc/retry';
import type { ChemWorkerApi, RpcCallOptions, RpcClient, RpcError } from '@/workers/rpc/contracts';
import { CHEM_CALL_TIMEOUT_MS, CHEM_SPECS } from './specs';

/** The answer of a batch check: what the worker said, or that it could not say (`timeout`: the worker was stopped after its limit). */
export type CheckCall<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: 'timeout' | 'unavailable'; readonly error: string };

export interface ChemService {
  parse(structure: StructureRep, options?: RpcCallOptions): Promise<ParseOutcome>;
  depict(structure: StructureRep, drawing: DepictionOptions, options?: RpcCallOptions): Promise<DepictOutcome>;
  checkSpecies(species: readonly SpeciesCheckRequest[], options?: RpcCallOptions): Promise<CheckCall<SpeciesChecksAnswer>>;
  checkReaction(outcomes: readonly BalanceRequest[], options?: RpcCallOptions): Promise<CheckCall<BalanceAnswer>>;
  checkMechanism(steps: readonly StepCheckRequest[], options?: RpcCallOptions): Promise<CheckCall<StepChecksAnswer>>;
  matches(probes: readonly MatchProbe[], options?: RpcCallOptions): Promise<CheckCall<MatchesAnswer>>;
}

function unanswered(error: RpcError): { readonly ok: false; readonly reason: 'timeout' | 'unavailable'; readonly error: string } {
  if (error.code === 'TIMEOUT') {
    return { ok: false, reason: 'timeout', error: `the structure toolkit did not answer within ${CHEM_CALL_TIMEOUT_MS} ms; it was restarted` };
  }
  return { ok: false, reason: 'unavailable', error: `the structure toolkit did not answer (${error.code}: ${error.message})` };
}

export function createChemService(client: RpcClient<ChemWorkerApi>): ChemService {
  const checked = async <T>(run: () => Promise<{ readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: RpcError }>): Promise<CheckCall<T>> => {
    const answer = await run();
    return answer.ok ? { ok: true, value: answer.value } : unanswered(answer.error);
  };
  return {
    async parse(structure, options) {
      const answer = await callWithRetry(client, CHEM_SPECS, 'parse', { structure }, options);
      return answer.ok ? answer.value : unanswered(answer.error);
    },
    async depict(structure, drawing, options) {
      const answer = await callWithRetry(client, CHEM_SPECS, 'depict', { structure, options: drawing }, options);
      return answer.ok ? answer.value : unanswered(answer.error);
    },
    checkSpecies: (species, options) => checked(() => callWithRetry(client, CHEM_SPECS, 'checkSpecies', { species }, options)),
    checkReaction: (outcomes, options) => checked(() => callWithRetry(client, CHEM_SPECS, 'checkReaction', { outcomes }, options)),
    checkMechanism: (steps, options) => checked(() => callWithRetry(client, CHEM_SPECS, 'checkMechanism', { steps }, options)),
    matches: (probes, options) => checked(() => callWithRetry(client, CHEM_SPECS, 'matches', { probes }, options)),
  };
}
