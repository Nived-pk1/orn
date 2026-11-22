// @vitest-environment jsdom
/** The address code is a lazy chunk (step 8.4g, size): loaded when the URL has an address, when the reader first changes view, or when the browser is idle. */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mounted = vi.fn();
const seenProps = vi.fn();
vi.mock('./address-driver', () => ({
  AddressDriver: (p: unknown) => {
    mounted();
    seenProps(p);
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

describe('AddressGate: the first address (step 8.4g Part B, P4)', () => {
  it('with no address, writes the view address at once by REPLACING (no new entry), before any code is loaded', async () => {
    const start = history.length;
    render(<AddressGate {...props} mode="navigator" ready />);
    expect(location.hash).toBe('#/map');
    expect(history.length).toBe(start);
    expect(mounted).not.toHaveBeenCalled();
  });

  it('writes other views by their own name, and leaves an address that is already there', async () => {
    render(<AddressGate {...props} mode="chapters" ready />);
    expect(location.hash).toBe('#/chapters');
    history.replaceState(null, '', '#/settings');
    render(<AddressGate {...props} mode="navigator" ready />);
    expect(location.hash).toBe('#/settings');
  });

  it('writes nothing before the app is ready; tells the driver the address came from the boot', async () => {
    const view = render(<AddressGate {...props} mode="navigator" ready={false} />);
    expect(location.hash).toBe('');
    view.rerender(<AddressGate {...props} mode="navigator" ready />);
    view.rerender(<AddressGate {...props} mode="reactions" ready />);
    await flush();
    expect(seenProps.mock.calls.at(-1)?.[0]).toMatchObject({ fromBoot: true });
  });
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

  it('an address the reader came with does not undo a view chosen before the code arrived (step T: e2e Keep my data after a reload, Firefox 2 of 40)', async () => {
    history.replaceState(null, '', '#/chapters');
    const view = render(<AddressGate {...props} mode="chapters" ready />);
    await flush();
    expect(seenProps.mock.calls.at(-1)?.[0]).toMatchObject({ fromBoot: false }); // nothing chosen yet: the address is carried out
    view.rerender(<AddressGate {...props} mode="navigator" ready />);
    await flush();
    expect(seenProps.mock.calls.at(-1)?.[0]).toMatchObject({ fromBoot: true }); // the reader chose Map: the address must not take it back
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
