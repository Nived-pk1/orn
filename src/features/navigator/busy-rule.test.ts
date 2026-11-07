import { describe, expect, it } from 'vitest';
import { BUSY_ARROWS, isBusy } from './busy-rule';

describe('the one busy rule', () => {
  it('is busy above 15 arrows, not at 15', () => {
    expect(BUSY_ARROWS).toBe(15);
    expect(isBusy(15)).toBe(false);
    expect(isBusy(16)).toBe(true);
    expect(isBusy(0)).toBe(false);
  });
});
