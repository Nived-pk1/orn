/**
 * The main thread's side of the chem worker: `ParseOutcome` and `DepictOutcome` from an `RpcClient<ChemWorkerApi>`. A call the
 * worker could not answer is a value with a reason (Phase 4 contract decisions Q7): `timeout` when the per-call limit ended it
 * (the worker was terminated and restarted; it is NOT retried, D4), `unavailable` for everything else (down, crashed, busy,
 * refused). Neither says anything about the structure, so the L4 checks show "check unavailable", never CHEM-001. A crash under
 * the call is retried once (parse and depict are idempotent). No chemistry here.
 */
import type { DepictionOptions, DepictOutcome, ParseOutcome } from '@/chem/contracts';
import type { StructureRep } from '@/core/schema';
import { callWithRetry } from '@/workers/rpc/retry';
import type { ChemWorkerApi, RpcCallOptions, RpcClient, RpcError } from '@/workers/rpc/contracts';
import { CHEM_CALL_TIMEOUT_MS, CHEM_SPECS } from './specs';

export interface ChemService {
  parse(structure: StructureRep, options?: RpcCallOptions): Promise<ParseOutcome>;
  depict(structure: StructureRep, drawing: DepictionOptions, options?: RpcCallOptions): Promise<DepictOutcome>;
}

function unanswered(error: RpcError): { readonly ok: false; readonly reason: 'timeout' | 'unavailable'; readonly error: string } {
  if (error.code === 'TIMEOUT') {
    return { ok: false, reason: 'timeout', error: `the structure toolkit did not answer within ${CHEM_CALL_TIMEOUT_MS} ms; it was restarted` };
  }
  return { ok: false, reason: 'unavailable', error: `the structure toolkit did not answer (${error.code}: ${error.message})` };
}

export function createChemService(client: RpcClient<ChemWorkerApi>): ChemService {
  return {
    async parse(structure, options) {
      const answer = await callWithRetry(client, CHEM_SPECS, 'parse', { structure }, options);
      return answer.ok ? answer.value : unanswered(answer.error);
    },
    async depict(structure, drawing, options) {
      const answer = await callWithRetry(client, CHEM_SPECS, 'depict', { structure, options: drawing }, options);
      return answer.ok ? answer.value : unanswered(answer.error);
    },
  };
}
