/**
 * Method specs of the chem worker (ADR-034, ADR-009, SECURITY §3): every call is idempotent (parsing, drawing or checking the same
 * structure twice gives the same answer, so `callWithRetry` may repeat it once after a crash) and has a 2 s limit. RDKit is
 * synchronous: a call over the limit cannot be interrupted, so the client answers `TIMEOUT`, terminates the worker and starts a
 * new one (the toolkit is loaded again on the first call after that).
 */
import type { ChemWorkerApi, RpcMethodSpecs } from '@/workers/rpc/contracts';

export const CHEM_CALL_TIMEOUT_MS = 2_000;

export const CHEM_SPECS: RpcMethodSpecs<ChemWorkerApi> = {
  parse: { idempotent: true, timeoutMs: CHEM_CALL_TIMEOUT_MS },
  depict: { idempotent: true, timeoutMs: CHEM_CALL_TIMEOUT_MS },
  checkSpecies: { idempotent: true, timeoutMs: CHEM_CALL_TIMEOUT_MS },
  checkReaction: { idempotent: true, timeoutMs: CHEM_CALL_TIMEOUT_MS },
  checkMechanism: { idempotent: true, timeoutMs: CHEM_CALL_TIMEOUT_MS },
  matches: { idempotent: true, timeoutMs: CHEM_CALL_TIMEOUT_MS },
};
