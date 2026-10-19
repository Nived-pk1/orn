import { describe, expect, it } from 'vitest';
import { createLocalTimeFormatter } from './local-time';

describe('createLocalTimeFormatter', () => {
  const iso = '2026-10-18T10:35:12.000Z';

  it('shows the time in the injected zone, with the zone named', () => {
    expect(createLocalTimeFormatter('UTC')(iso)).toBe('2026-10-18 10:35 UTC');
    expect(createLocalTimeFormatter('Asia/Kolkata')(iso)).toBe('2026-10-18 16:05 GMT+5:30');
  });

  it('follows the zone across a date line', () => {
    expect(createLocalTimeFormatter('Asia/Kolkata')('2026-10-18T20:00:00.000Z')).toBe('2026-10-19 01:30 GMT+5:30');
  });

  it('gives back what it cannot read, unchanged', () => {
    expect(createLocalTimeFormatter('UTC')('not a time')).toBe('not a time');
  });
});
