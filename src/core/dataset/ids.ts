/**
 * ID factory: `<prefix>_<lowercase ULID>` with an injected clock and RNG (INV-03, determinism).
 * ULID = 10 characters of time (48-bit ms) + 16 characters of randomness (80 bits), Crockford base32.
 * Monotonic: IDs from one factory sort strictly increasing, even within one millisecond or when the
 * clock steps backwards.
 */
import type { Clock, IdFactory, RandomSource } from './contracts';

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
const TIME_LENGTH = 10;
const RANDOM_LENGTH = 16;
const MAX_TIME_MS = 2 ** 48 - 1;
const PREFIX_PATTERN = /^[a-z]{3}$/;

function encodeTime(ms: number): string {
  let rest = ms;
  let out = '';
  for (let i = 0; i < TIME_LENGTH; i += 1) {
    out = ALPHABET.charAt(rest % 32) + out;
    rest = Math.floor(rest / 32);
  }
  return out;
}

function randomDigits(rng: RandomSource): number[] {
  const digits: number[] = [];
  for (let i = 0; i < RANDOM_LENGTH; i += 1) {
    const value = rng.next();
    if (!(value >= 0 && value < 1)) throw new RangeError('RandomSource.next() must return a number in [0, 1)');
    digits.push(Math.floor(value * 32));
  }
  return digits;
}

/** Adds one to a base-32 digit array in place; returns false on overflow. */
function increment(digits: number[]): boolean {
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    const digit = digits[i] ?? 0;
    if (digit < 31) {
      digits[i] = digit + 1;
      return true;
    }
    digits[i] = 0;
  }
  return false;
}

function checkedMs(clock: Clock): number {
  const ms = clock.nowMs();
  if (!Number.isInteger(ms) || ms < 0 || ms > MAX_TIME_MS) {
    throw new RangeError('Clock.nowMs() must return an integer in [0, 2^48)');
  }
  return ms;
}

export function createIdFactory(clock: Clock, rng: RandomSource): IdFactory {
  let lastTime = -1;
  let lastDigits: number[] = [];

  function nextUlid(): string {
    const observed = checkedMs(clock);
    // A clock that steps backwards keeps the last time so IDs stay strictly increasing.
    if (observed > lastTime) {
      lastTime = observed;
      lastDigits = randomDigits(rng);
    } else if (!increment(lastDigits)) {
      throw new RangeError('ULID random component overflowed within one millisecond');
    }
    return encodeTime(lastTime) + lastDigits.map((d) => ALPHABET.charAt(d)).join('');
  }

  return {
    now(): string {
      return new Date(checkedMs(clock)).toISOString();
    },
    newId(prefix: string): string {
      if (!PREFIX_PATTERN.test(prefix)) throw new RangeError(`ID prefix must be three lowercase letters, got "${prefix}"`);
      return `${prefix}_${nextUlid()}`;
    },
  };
}
