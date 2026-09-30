/**
 * The worker's `IdFactory`, rebuilt for ONE call from the data main sends (step 4.2c): a fixed instant and a seeded
 * generator, so every ID and timestamp the worker mints is a function of the call. The worker has no clock or random source
 * of its own for IDs (CLAUDE.md non-negotiable 6).
 */
import { createIdFactory, type IdFactory, type RandomSource } from '@/core/dataset';
import type { IdData } from '@/workers/rpc/contracts';
import { RpcHostError } from '@/workers/rpc/helpers';

/** mulberry32: a small, well-known 32-bit generator; uniform floats in [0, 1). */
export function seededRandom(seed: number): RandomSource {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** `BAD_REQUEST` (a programmer error on the caller's side) for data that is not an instant in `toISOString()` form or a 32-bit seed. */
export function idFactoryFrom(data: IdData): IdFactory {
  const ms = Date.parse(data.nowIso);
  if (typeof data.nowIso !== 'string' || !Number.isFinite(ms) || new Date(ms).toISOString() !== data.nowIso) {
    throw new RpcHostError('BAD_REQUEST', `ids.nowIso must be a UTC ISO timestamp with milliseconds, got ${JSON.stringify(data.nowIso)}`);
  }
  if (!Number.isInteger(data.seed) || data.seed < 0 || data.seed > 0xffffffff) {
    throw new RpcHostError('BAD_REQUEST', `ids.seed must be an integer in [0, 2^32), got ${String(data.seed)}`);
  }
  return createIdFactory({ nowMs: () => ms }, seededRandom(data.seed));
}
