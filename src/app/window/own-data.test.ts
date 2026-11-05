/** Whether the browser holds the visitor's own imported data (step 8.3): read tolerantly at boot, marked by an own import, cleared by the published load. */
import { describe, expect, it, vi } from 'vitest';
import { createOwnData, NO_OWN_DATA, OWN_DATA_KEY } from './own-data';

const services = (uiState: Record<string, unknown>, mode: 'writer' | 'follower' = 'writer') => {
  const setUiState = vi.fn(() => Promise.resolve());
  return { setUiState, services: { bootReport: { uiState }, persistence: { setUiState }, status: { get: () => ({ mode }) } } as never };
};

describe('createOwnData', () => {
  it('reads { own: true } at boot and nothing else', () => {
    expect(createOwnData(services({ [OWN_DATA_KEY]: { own: true } }).services).get()).toBe(true);
    for (const bad of [undefined, null, true, 'yes', [], {}, { own: 1 }, { own: false }]) expect(createOwnData(services({ [OWN_DATA_KEY]: bad }).services).get()).toBe(false);
  });
  it('mark: true at once, told to listeners, written once as { own: true } by a writer tab', () => {
    const { services: s, setUiState } = services({});
    const own = createOwnData(s);
    const listener = vi.fn();
    own.subscribe(listener);
    own.mark();
    own.mark();
    expect(own.get()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(setUiState).toHaveBeenCalledTimes(1);
    expect(setUiState).toHaveBeenCalledWith(OWN_DATA_KEY, { own: true });
  });
  it('clear: false again and written; a follower tab changes its own view and writes nothing', () => {
    const writer = services({ [OWN_DATA_KEY]: { own: true } });
    const own = createOwnData(writer.services);
    own.clear();
    expect(own.get()).toBe(false);
    expect(writer.setUiState).toHaveBeenCalledWith(OWN_DATA_KEY, { own: false });
    const follower = services({}, 'follower');
    const other = createOwnData(follower.services);
    other.mark();
    expect(other.get()).toBe(true);
    expect(follower.setUiState).not.toHaveBeenCalled();
  });
  it('works without services (memory only), and NO_OWN_DATA never changes', () => {
    const own = createOwnData();
    own.mark();
    expect(own.get()).toBe(true);
    NO_OWN_DATA.mark();
    expect(NO_OWN_DATA.get()).toBe(false);
  });
});
