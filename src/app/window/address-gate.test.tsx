// @vitest-environment jsdom
/** The address code is a lazy chunk (step 8.4g, size): loaded when the URL has an address, when the reader first changes view, or when the browser is idle. */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mounted = vi.fn();
vi.mock('./address-driver', () => ({
  AddressDriver: () => {
    mounted();
    return null;
  },
}));

import { AddressGate } from './address-gate';

const props = { setMode: () => undefined, views: [], open: {}, openPane: () => undefined, lost: null, setLost: () => undefined } as const;
const flush = async (): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  mounted.mockClear();
  history.replaceState(null, '', location.pathname);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AddressGate', () => {
  it('loads nothing before the app is ready', async () => {
    history.replaceState(null, '', '#/settings');
    render(<AddressGate {...props} mode="navigator" ready={false} />);
    await flush();
    expect(mounted).not.toHaveBeenCalled();
  });

  it('loads at once when the URL has an address', async () => {
    history.replaceState(null, '', '#/settings');
    render(<AddressGate {...props} mode="navigator" ready />);
    await flush();
    expect(mounted).toHaveBeenCalled();
  });

  it('with no address, waits for the first change of view', async () => {
    const view = render(<AddressGate {...props} mode="navigator" ready />);
    await flush();
    expect(mounted).not.toHaveBeenCalled();
    view.rerender(<AddressGate {...props} mode="reactions" ready />);
    await flush();
    expect(mounted).toHaveBeenCalled();
  });

  it('with no address and no change, loads when the browser is idle', async () => {
    render(<AddressGate {...props} mode="navigator" ready />);
    await flush();
    expect(mounted).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(mounted).toHaveBeenCalled();
  });
});
