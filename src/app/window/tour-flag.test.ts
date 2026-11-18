import { describe, expect, it, vi } from 'vitest';
import { createTourFlag, TOUR_KEY } from './tour-flag';

const services = (uiState: Record<string, unknown> = {}, mode: 'writer' | 'reader' = 'writer') => {
  const setUiState = vi.fn(() => Promise.resolve());
  return { setUiState, services: { bootReport: { uiState }, persistence: { setUiState }, status: { get: () => ({ mode }) } } as never };
};

describe('the first-run tour flag (step 8.4g Part B, G4)', () => {
  it('is not done at first, and done when the stored flag says so; anything else is "not done"', () => {
    expect(createTourFlag(services().services).done()).toBe(false);
    expect(createTourFlag(services({ [TOUR_KEY]: { done: true } }).services).done()).toBe(true);
    expect(createTourFlag(services({ [TOUR_KEY]: 'yes' }).services).done()).toBe(false);
    expect(createTourFlag(services({ [TOUR_KEY]: { done: 1 } }).services).done()).toBe(false);
  });

  it('finish writes the flag once, tells the listeners, and a second finish writes nothing', () => {
    const { services: s, setUiState } = services();
    const flag = createTourFlag(s);
    const seen = vi.fn();
    flag.subscribe(seen);
    flag.finish();
    flag.finish();
    expect(flag.done()).toBe(true);
    expect(setUiState).toHaveBeenCalledTimes(1);
    expect(setUiState).toHaveBeenCalledWith(TOUR_KEY, { done: true });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('a tab that cannot write keeps it in memory only', () => {
    const { services: s, setUiState } = services({}, 'reader');
    const flag = createTourFlag(s);
    flag.finish();
    expect(flag.done()).toBe(true);
    expect(setUiState).not.toHaveBeenCalled();
  });
});
