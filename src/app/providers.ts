/**
 * The production providers (step 5.1a, Phase 5 decision Q8): the only place in the app that reads the system clock and
 * `crypto`. `createAppServices` takes all of them from its env, so tests inject fakes and nothing under `src/app/services`
 * touches a global.
 */
import type { Clock, RandomSource } from '@/core/dataset/contracts';
import { realScheduler, type Scheduler } from '@/persistence';

/** Milliseconds since the Unix epoch, from the system clock. */
export const systemClock: Clock = { nowMs: () => Date.now() };

/** The part of `Crypto` used for random numbers. */
export interface RandomValuesSource {
  getRandomValues(array: Uint32Array<ArrayBuffer>): unknown;
}

const UINT32_RANGE = 4_294_967_296;

/** Uniform floats in [0, 1) from `crypto.getRandomValues` (32 bits per number). */
export function createCryptoRandom(source: RandomValuesSource): RandomSource {
  const buffer = new Uint32Array(1);
  return {
    next() {
      source.getRandomValues(buffer);
      return (buffer[0] as number) / UINT32_RANGE;
    },
  };
}

/** `setTimeout`-backed timers (the persistence layer's own real scheduler). */
export const systemTimers: Scheduler = realScheduler;
