import { describe, expect, it } from 'vitest';
import { createCryptoRandom, systemClock, systemTimers } from './providers';

describe('production providers (the only code that reads the system clock and crypto)', () => {
  it('createCryptoRandom maps 32 random bits to a float in [0, 1)', () => {
    const words = [0, 2_147_483_648, 4_294_967_295];
    let i = 0;
    const random = createCryptoRandom({
      getRandomValues(array: Uint32Array<ArrayBuffer>): unknown {
        array[0] = words[i++ % words.length] as number;
        return array;
      },
    });
    expect(random.next()).toBe(0);
    expect(random.next()).toBe(0.5);
    const last = random.next();
    expect(last).toBeLessThan(1);
    expect(last).toBeGreaterThan(0.999999);
  });

  it('createCryptoRandom works with the real crypto of this runtime', () => {
    const random = createCryptoRandom(globalThis.crypto);
    for (let i = 0; i < 20; i += 1) {
      const value = random.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('systemClock is milliseconds since the Unix epoch', () => {
    const before = Date.now();
    const now = systemClock.nowMs();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThan(before + 5_000);
  });

  it('systemTimers run a callback after a delay and can cancel it', async () => {
    let ran = 0;
    const cancel = systemTimers.after(1, () => (ran += 1));
    cancel();
    systemTimers.after(2, () => (ran += 10));
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    expect(ran).toBe(10);
  });
});
